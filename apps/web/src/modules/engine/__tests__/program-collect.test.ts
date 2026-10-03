import { describe, expect, it } from "vitest";
import { isDeepStrictEqual } from "node:util";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { compileMechanisms, programCollectorFor, ProgramCollector } from "../graph";
import { MechanismRegistry, mechanismsFromData, type MechanismContext, type MechanismDefinition } from "../mechanisms";
import { Rng } from "../rng";
import { cloneState, makeActive, makeSide, makeState } from "../state";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import type { BattleState, Dict, Side } from "../types";
import { satisfy } from "./support";

/** G2b 回归基准：**程序是 collect 源** 与 DSL 注册表逐命令等价。
 *
 * - collect 等价：同一 MechanismContext（触发器 + 侧 + 事件）下 `MechanismRegistry.collect` vs
 *   `ProgramCollector.collect`——命令逐条深比较（definition / meta / effectIndex）+ 收集后状态（onceFired 标记）等；
 *   样本覆盖全部触发器、oncePerTurn、priority、多条件、无侧调用点（battleStart 语义）。
 * - 战斗等价：同一夹具、同种子逐步 `step`，事件流与终态逐步深比较（默认**程序源** vs **注入 DSL 源**）。
 * - 性能参考仅写报告不设断言：G2b-1.5 AND 脊门控后程序源与 DSL 同量级（collect +17% / step +10%，
 *   见《引擎执行图》§16），默认源已切程序。
 */

const bundle = getBundle();
const defs = mechanismsFromData(bundle.mechanisms);
const dslSource = new MechanismRegistry(defs);
const programSource: ProgramCollector = programCollectorFor(bundle);

function fixture(): BattleState {
  const ids = Object.keys(bundle.sprites);
  const side = (id: string) => makeSide(makeActive(id, { hp: 130, maxHp: 130, energy: 6 }), { magic: 3 });
  const state = makeState(side(ids[0]), side(ids[1]), { seed: 42, turn: 3 });
  state.onceFired = {};
  return state;
}

/** 每触发器取一条样本 + oncePerTurn / priority / 多条件命中项（覆盖特殊分支）。 */
function samples(): MechanismDefinition[] {
  const picked: MechanismDefinition[] = [];
  const seenIds = new Set<string>();
  const seenTriggers = new Set<string>();
  const push = (def: MechanismDefinition | undefined) => {
    if (def && !seenIds.has(def.id)) {
      seenIds.add(def.id);
      picked.push(def);
    }
  };
  for (const def of defs) {
    if (!seenTriggers.has(def.trigger)) {
      seenTriggers.add(def.trigger);
      push(def);
    }
  }
  defs.filter((def) => def.oncePerTurn).slice(0, 3).forEach(push);
  defs.filter((def) => def.priority !== undefined).forEach(push);
  defs.filter((def) => (def.when ?? []).length > 1).slice(0, 4).forEach(push);
  return picked;
}

interface Ctx {
  base: BattleState;
  event: Dict;
  actorSide?: Side;
  targetSide?: Side;
}

/** 合成可满足上下文（satisfy 写入 pristine 夹具；两侧随后各取克隆）。battleStart 走无侧调用点。 */
function contextFor(def: MechanismDefinition): Ctx {
  const base = fixture();
  const event: Dict = {};
  const scope: Dict = { state: base, event, turn: base.turn, self: base.player, actor: base.player, target: base.enemy, opponent: base.enemy };
  def.when?.forEach((cond) => satisfy(cond, scope, true));
  if (def.trigger === "battleStart") return { base, event }; // triggerState(st, "battleStart") 不传侧
  return { base, event, actorSide: "player", targetSide: "enemy" };
}

function collectRun(source: { collect(ctx: MechanismContext): unknown[] }, def: MechanismDefinition, ctx: Ctx) {
  const state = cloneState(ctx.base);
  const commands = source.collect({
    state,
    trigger: def.trigger,
    actorSide: ctx.actorSide,
    targetSide: ctx.targetSide,
    event: ctx.event,
  } as MechanismContext);
  return { commands, state };
}

describe("G2b 程序化 collect（ProgramCollector）", () => {
  it("全样本触发器：程序源与 DSL 源 逐命令等价 + onceFired 标记等价", () => {
    const list = samples();
    expect(list.length).toBeGreaterThanOrEqual(12);
    const failures: string[] = [];
    for (const def of list) {
      const ctx = contextFor(def);
      const legacy = collectRun(dslSource, def, ctx);
      const program = collectRun(programSource, def, ctx);
      if (!isDeepStrictEqual(program.commands, legacy.commands)) failures.push(`${def.id}(${def.trigger}): 命令不等价`);
      else if (!isDeepStrictEqual(program.state, legacy.state)) failures.push(`${def.id}(${def.trigger}): onceFired 状态不等价`);
    }
    expect(failures, `collect 等价失败 ${failures.length}/${list.length} 条`).toEqual([]);
  });

  it("battleStart 无侧上下文：actorSide/targetSide 均为 undefined 时仍逐命令等价", () => {
    const def = defs.find((d) => d.trigger === "battleStart");
    expect(def, "数据缺 battleStart 机制").toBeDefined();
    const ctx = contextFor(def!);
    expect(ctx.actorSide).toBeUndefined();
    const legacy = collectRun(dslSource, def!, ctx);
    const program = collectRun(programSource, def!, ctx);
    expect(program.commands).toEqual(legacy.commands);
    expect(program.state).toEqual(legacy.state);
  });

  it("同种子整场战斗：程序源（默认）与 DSL 源注入 逐步事件流 + 终态一致", () => {
    const programSim = new Simulator(bundle); // 默认 = 程序源
    const dslSim = new Simulator(bundle, dslSource); // 注入 DSL 对照
    let s1 = fixture();
    let s2 = cloneState(s1);
    const seeds = [7, 11, 13, 17];
    for (let turn = 0; turn < 9; turn++) {
      if (programSim.terminal(s1).ended) break;
      const playerAction = programSim.legalActions(s1, "player")[0] ?? { kind: "energy" as const };
      const enemyAction = programSim.legalActions(s1, "enemy")[0] ?? { kind: "energy" as const };
      const r1 = programSim.step(s1, playerAction, enemyAction, new Rng(seeds[turn % seeds.length]));
      const r2 = dslSim.step(s2, playerAction, enemyAction, new Rng(seeds[turn % seeds.length]));
      if (!isDeepStrictEqual(r2.events, r1.events)) {
        expect.fail(`第 ${turn + 1} 回合事件流不等价：\n程序源 ${JSON.stringify(r1.events).slice(0, 500)}\nDSL 源 ${JSON.stringify(r2.events).slice(0, 500)}`);
      }
      expect(r2.state).toEqual(r1.state);
      s1 = r1.state;
      s2 = r2.state;
    }
  });

  it("性能参考（写入临时报告，不设断言）：collect / 全量编译 / 整场 step", () => {
    const def = samples()[0];
    const ctx = contextFor(def);
    const lines: string[] = [];
    const time = (label: string, rounds: number, fn: () => void) => {
      const t0 = performance.now();
      for (let i = 0; i < rounds; i++) fn();
      const ms = performance.now() - t0;
      lines.push(`${label}: ${(ms / rounds).toFixed(3)}ms/轮（${rounds} 轮共 ${ms.toFixed(0)}ms）`);
    };
    time("DSL collect", 200, () => {
      const state = cloneState(ctx.base);
      dslSource.collect({ state, trigger: def.trigger, actorSide: ctx.actorSide, targetSide: ctx.targetSide, event: ctx.event } as MechanismContext);
    });
    time("程序 collect", 200, () => {
      const state = cloneState(ctx.base);
      programSource.collect({ state, trigger: def.trigger, actorSide: ctx.actorSide, targetSide: ctx.targetSide, event: ctx.event } as MechanismContext);
    });
    // 微基准：极小程序（2 节点链）单次 collect —— 分离「runProgram 固定开销」与「节点执行开销」。
    const tiny: import("../graph").Program = {
      programVersion: "1",
      nodes: [
        { id: `${def.id}#entry0`, type: `on.${def.trigger}`, params: { mechanismId: def.id, ownerType: def.ownerType, ownerId: def.ownerId, priority: 0 } },
        { id: `${def.id}#w0`, type: "write.modifyEnergy", params: { mechanismId: def.id, effectIndex: 0, spec: { type: "modifyEnergy", target: "self", delta: 1 } } },
      ],
      edges: [{ from: { node: `${def.id}#entry0`, port: "out" }, to: { node: `${def.id}#w0`, port: "in" }, kind: "control" }],
      entries: [`${def.id}#entry0`],
    };
    const tinyCollector = new ProgramCollector(tiny, bundle);
    time("微基准·极小程序 collect（2 节点）", 2000, () => {
      const state = cloneState(ctx.base);
      tinyCollector.collect({ state, trigger: def.trigger, actorSide: ctx.actorSide, targetSide: ctx.targetSide, event: ctx.event } as MechanismContext);
    });
    time("编译全量程序", 5, () => {
      compileMechanisms(defs);
    });
    const runSteps = (sim: Simulator) => {
      let s = fixture();
      for (let i = 0; i < 4 && !sim.terminal(s).ended; i++) {
        const p = sim.legalActions(s, "player")[0] ?? { kind: "energy" as const };
        const e = sim.legalActions(s, "enemy")[0] ?? { kind: "energy" as const };
        s = sim.step(s, p, e, new Rng(5)).state;
      }
    };
    const dslSim = new Simulator(bundle, dslSource); // 注入 DSL 对照
    const programSim = new Simulator(bundle); // 默认 = 程序源（门控后）
    time("DSL 源 step×4（注入）", 30, () => runSteps(dslSim));
    time("程序源 step×4（默认）", 30, () => runSteps(programSim));
    // 门控命中参考：beforeAction 全量机制数 vs 身份不匹配事件下实际收集数（G2b-1.5 AND 脊门控）。
    const gateCtx = { state: cloneState(fixture()), trigger: "beforeAction", actorSide: "player", targetSide: "enemy", event: { action: { kind: "skill", skillId: "sk-none" } } } as MechanismContext;
    const beforeActionTotal = defs.filter((d) => d.trigger === "beforeAction").length;
    lines.push(`门控参考：beforeAction 机制 ${beforeActionTotal} 条 → 身份不匹配事件实际收集 ${dslSource.collect(gateCtx).length} 条`);
    writeFileSync(path.join(tmpdir(), "shigu-rock-g2b-perf.txt"), lines.join("\n"), "utf8");
    expect(lines.length).toBeGreaterThan(0);
  });
});
