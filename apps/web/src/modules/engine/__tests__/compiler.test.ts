import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { compileMechanism, compileMechanisms, createRegistry, runProgram, validateProgram } from "../graph";
import {
  ActionQueue,
  MechanismRegistry,
  MechanismRuntime,
  mechanismsFromData,
  type MechanismDefinition,
  type MechanismEvent,
} from "../mechanisms";
import { cloneState, makeActive, makeSide, makeState } from "../state";
import { getBundle } from "../server";
import type { BattleState, DataBundle, Dict, Side } from "../types";
import { satisfy } from "./support";

/** G2 回归基准：每条机制「dispatch + 三段应用」（旧路径） vs 「编译程序 + runProgram」（新路径），
 *  同一状态 / 同一事件上下文下 逐事件 与 终态 深比较；另覆盖全量编译校验、oncePerTurn、确定性与合并程序。
 */

const nodeRegistry = createRegistry();

const parsed = JSON.parse(readFileSync(new URL("../../../../../../data/mechanisms.json", import.meta.url), "utf8"));
const mechanisms: MechanismDefinition[] = mechanismsFromData(parsed);
const dataEffectTypes = [...new Set(mechanisms.flatMap((m) => m.effects.map((e) => e.type)))];
const dataTriggers = [...new Set(mechanisms.map((m) => m.trigger))];

let cachedBundle: DataBundle | undefined;
function bundle(): DataBundle {
  cachedBundle ??= getBundle();
  return cachedBundle;
}

/** 双方精灵取真实图鉴 id；seed / onceFired 固定（onceFired 显式置空以走门路径）。 */
function fixture(): BattleState {
  const ids = Object.keys(bundle().sprites);
  expect(ids.length, "图鉴精灵不足 2").toBeGreaterThanOrEqual(2);
  const side = (id: string) => makeSide(makeActive(id, { hp: 130, maxHp: 130, energy: 6 }), { magic: 3 });
  const state = makeState(side(ids[0]), side(ids[1]), { seed: 42, turn: 3 });
  state.onceFired = {};
  return state;
}

/** 合成上下文：对 pristine 夹具 + 事件写入可满足值（随后两侧各取自己的克隆）。 */
function prepare(def: MechanismDefinition, base: BattleState, event: Dict): void {
  if (!def.when?.length) return;
  const scope: Dict = { state: base, event, turn: base.turn, self: base.player, actor: base.player, target: base.enemy, opponent: base.enemy };
  def.when.forEach((cond) => satisfy(cond, scope, true));
}

interface Outcome {
  events: MechanismEvent[];
  state: BattleState;
}

function freshActions(): { queue: ActionQueue; actionIds: Record<Side, string>; nextActionId: () => string } {
  const actionIds: Record<Side, string> = { player: "act-player", enemy: "act-enemy" };
  const queue = new ActionQueue();
  for (const side of ["player", "enemy"] as Side[]) {
    queue.enqueue({ id: actionIds[side], actorSide: side, action: { kind: "skill" }, declaredAt: 0, priority: 0, speedSnapshot: 1, status: "queued" });
  }
  let extra = 0;
  return { queue, actionIds, nextActionId: () => `act-extra-${extra++}` };
}

/** 旧路径：dispatch 收集 → applyAction → applyState → applyDamage（与 simulate 各调用点一致的三段协议）。 */
function runReference(def: MechanismDefinition, state: BattleState, event: Dict): Outcome {
  const runtime = new MechanismRuntime(new MechanismRegistry([def]));
  const commands = runtime.dispatch({ state, trigger: def.trigger, actorSide: "player", targetSide: "enemy", event });
  const { queue, actionIds, nextActionId } = freshActions();
  const events = [
    ...runtime.applyActionCommands(queue, commands, actionIds, nextActionId),
    ...runtime.applyStateCommands(state, commands, bundle()),
    ...runtime.applyDamageCommands(state, bundle(), commands),
  ];
  return { events, state };
}

/** 新路径：编译程序 → runProgram（写入节点按同序三段路由，共享注册表供级联 / ruleModifiers）。 */
function runGraph(def: MechanismDefinition, state: BattleState, event: Dict): Outcome {
  const { program, entry } = compileMechanism(def);
  const issues = validateProgram(program, nodeRegistry).filter((issue) => issue.level === "error");
  expect(issues, `${def.id} 编译校验失败`).toEqual([]);
  const registry = new MechanismRegistry([def]);
  const { state: gState, trace } = runProgram({
    program,
    registry: nodeRegistry,
    bundle: bundle(),
    state,
    entry,
    event,
    trigger: def.trigger,
    actorSide: "player",
    targetSide: "enemy",
    mechanisms: registry,
    actions: freshActions(),
  });
  const events = trace
    .filter((t) => t.type.startsWith("write."))
    .flatMap((t) => ((t.outputs?.events as MechanismEvent[] | undefined) ?? []));
  return { events, state: gState };
}

function compare(def: MechanismDefinition, event: Dict, base: BattleState): void {
  const reference = runReference(def, cloneState(base), event);
  const graph = runGraph(def, base, event);
  expect(graph.events, `${def.id} 事件流不等价`).toEqual(reference.events);
  expect(graph.state, `${def.id} 终态不等价`).toEqual(reference.state);
}

describe("G2 机制编译器", () => {
  it("data/mechanisms.json 全量可编译且 validateProgram 零错误", () => {
    expect(mechanisms.length).toBeGreaterThan(400);
    const problems: string[] = [];
    for (const def of mechanisms) {
      const { program } = compileMechanism(def);
      for (const issue of validateProgram(program, nodeRegistry)) {
        problems.push(`${def.id}: ${issue.message}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("数据用到的效果类型 / 触发器全部有对应节点（编译漂移守卫）", () => {
    const missingEffects = dataEffectTypes.filter((type) => !nodeRegistry.has(`write.${type}`));
    const missingTriggers = dataTriggers.filter((trigger) => !nodeRegistry.has(`on.${trigger}`));
    expect(missingEffects).toEqual([]);
    expect(missingTriggers).toEqual([]);
  });

  it("全量机制：同上下文下 旧路径与编译程序 逐事件 + 终态 等价", () => {
    const diffs: string[] = [];
    let executed = 0; // 覆盖率哨兵：条件满足后真正产生事件的机制数（防空跑假绿）
    for (const def of mechanisms) {
      const base = fixture();
      const event: Dict = {};
      try {
        prepare(def, base, event);
        const reference = runReference(def, cloneState(base), event);
        const graph = runGraph(def, base, event);
        if (reference.events.length > 0) executed += 1;
        if (!isDeepStrictEqual(graph.events, reference.events)) {
          diffs.push(`${def.id}: 事件流不等价`);
          continue;
        }
        if (!isDeepStrictEqual(graph.state, reference.state)) {
          diffs.push(`${def.id}: 终态不等价`);
        }
      } catch (error) {
        diffs.push(`${def.id}: ${(error as Error).message}`);
      }
    }
    expect(diffs, `等价失败 ${diffs.length}/${mechanisms.length} 条`).toEqual([]);
    expect(executed, `实际执行事件的机制过少（${executed}/${mechanisms.length}），条件满足器可能失效`).toBeGreaterThan(mechanisms.length / 2);
  });

  it("oncePerTurn：同状态连续两次派发，门语义两侧一致", () => {
    const def = mechanisms.find((m) => m.oncePerTurn && m.trigger !== "passive");
    expect(def, "缺少 oncePerTurn 机制").toBeDefined();
    const base = fixture();
    const event: Dict = {};
    prepare(def!, base, event);

    const refFirst = runReference(def!, cloneState(base), event);
    const refSecond = runReference(def!, refFirst.state, event);
    const graphFirst = runGraph(def!, base, event);
    const graphSecond = runGraph(def!, graphFirst.state, event);

    expect(graphFirst.events).toEqual(refFirst.events);
    expect(graphFirst.state).toEqual(refFirst.state);
    expect(graphSecond.events, "第二次派发应被门拦截").toEqual(refSecond.events);
    expect(graphSecond.state).toEqual(refSecond.state);
    expect(graphSecond.state.onceFired).toEqual(refSecond.state.onceFired);
  });

  it("确定性：同种子同输入重复运行，事件与终态逐字节一致", () => {
    const def = mechanisms.find((m) => m.effects.some((e) => e.type === "dealDamage"));
    expect(def).toBeDefined();
    const event: Dict = {};
    const base = fixture();
    prepare(def!, base, event);
    const first = runGraph(def!, base, event);
    const second = runGraph(def!, base, event);
    expect(second.events).toEqual(first.events);
    expect(second.state).toEqual(first.state);
  });

  it("合并程序：全量子图拼接后仍通过校验，entries 与机制同序", () => {
    const program = compileMechanisms(mechanisms);
    expect(program.entries).toHaveLength(mechanisms.length);
    expect(validateProgram(program, nodeRegistry).filter((i) => i.level === "error")).toEqual([]);
    // entries 顺序 = collect 的 priority desc / id asc
    const sorted = [...mechanisms].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
    expect(program.entries).toEqual(sorted.map((m) => `${m.id}#entry0`));
  });

  it("条件组合子：allOf / anyOf / not / has / contains / in / valueFrom 与 conditionsMatch 等价", () => {
    const synthetic: MechanismDefinition[] = [
      {
        id: "syn:any-not-has",
        ownerType: "trait",
        ownerId: "t",
        trigger: "turnStart",
        when: [
          {
            anyOf: [
              { path: "event.flag", op: "eq", value: "a" },
              { path: "event.flag", op: "eq", value: "b" },
            ],
          },
          { not: { path: "event.locked", op: "has", value: "k" } },
        ],
        effects: [{ type: "modifyEnergy", target: "player", delta: 2 }],
      },
      {
        id: "syn:valuefrom-gte",
        ownerType: "trait",
        ownerId: "t",
        trigger: "turnEnd",
        when: [{ path: "self.active.hp", op: "gte", valueFrom: { path: "self.active.maxHp", scale: 0.5 } }],
        effects: [{ type: "modifyMagic", target: "player", delta: -1 }],
      },
      {
        id: "syn:contains-in",
        ownerType: "skill",
        ownerId: "sk-1",
        trigger: "beforeAction",
        when: [
          { path: "event.tags", op: "contains", value: "x" },
          { path: "event.pick", op: "in", value: ["p", "q"] },
          { path: "event.n", op: "lte", value: 3 },
          { path: "event.diff", op: "neq", value: "same" },
        ],
        effects: [{ type: "clearStat", target: "opponent", polarity: "debuff" }],
      },
    ];
    for (const def of synthetic) {
      const base = fixture();
      const event: Dict = {};
      prepare(def, base, event);
      compare(def, event, base);
    }
  });
});
