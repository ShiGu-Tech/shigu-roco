import { describe, expect, it } from "vitest";

import { conditionScope, conditionsMatch, gateLeavesFor, gatePasses, MechanismRegistry, mechanismsFromData, type MechanismContext, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { cloneState, makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";
import { satisfy } from "./support";
import type { Dict } from "../types";

/** G2b-1.5 AND 脊门控回归：
 *  1. 合成语义：allOf 脊叶可前置、anyOf / not 不前置，且门控假 ⇒ conditionsMatch 必假（soundness）。
 *  2. 全量数据 soundness：任意上下文下「门控假 ⇒ conditionsMatch 假」——门控是纯短路提前的**充要安全条件**。
 *  3. 骨架等价：门控版 collect 的（机制序, effectIndex）序列 === 不门控参照公式（含 oncePerTurn / priority）。
 *  4. 普查守卫：可门控机制数（数据改动时的回归绊线）。
 */

const bundle = getBundle();
const defs = mechanismsFromData(bundle.mechanisms);

function fixture(): BattleState {
  const ids = Object.keys(bundle.sprites);
  const state = makeState(makeSide(makeActive(ids[0], { hp: 130, maxHp: 130, energy: 6 })), makeSide(makeActive(ids[1], { hp: 130, maxHp: 130, energy: 6 })), { seed: 9, turn: 3 });
  state.onceFired = {};
  return state;
}

describe("G2b-1.5 AND 脊门控", () => {
  it("合成语义：allOf 脊叶前置、anyOf / not 不前置，门控假 ⇒ conditionsMatch 必假", () => {
    const leaf: import("../mechanisms").Condition = { path: "event.action.skillId", op: "eq", value: "sk-x" };
    const nested: MechanismDefinition = {
      id: "t:nested",
      ownerType: "system",
      ownerId: "t",
      trigger: "turnEnd",
      when: [{ allOf: [leaf, { anyOf: [{ path: "state.turn", op: "gt", value: 1 }] }] }],
      effects: [],
    };
    expect(gateLeavesFor(nested)).toEqual([leaf]);

    const anyNot: MechanismDefinition = {
      id: "t:anynot",
      ownerType: "system",
      ownerId: "t",
      trigger: "turnEnd",
      when: [{ anyOf: [leaf] }, { not: leaf }],
      effects: [],
    };
    expect(gateLeavesFor(anyNot)).toEqual([]);

    const ctx = { state: fixture(), trigger: "turnEnd", event: { action: { skillId: "sk-y" } } } as MechanismContext;
    const scope = conditionScope(ctx);
    expect(gatePasses(scope, nested)).toBe(false);
    expect(conditionsMatch(ctx, nested.when)).toBe(false);
    // 门控为真时仍需全量求值（门控只作负向过滤，不替代 anyOf / not 判定）。
    const ctx2 = { state: fixture(), trigger: "turnEnd", event: { action: { skillId: "sk-x" }, turn: 5 } } as MechanismContext;
    expect(gatePasses(conditionScope(ctx2), nested)).toBe(true);
    expect(conditionsMatch(ctx2, nested.when)).toBe(true);
  });

  it("全量数据 soundness：门控假 ⇒ conditionsMatch 必假（身份不匹配事件遍历全部触发器）", () => {
    const triggers = [...new Set(defs.map((def) => def.trigger))];
    let gatedFalse = 0;
    for (const trigger of triggers) {
      const ctx = {
        state: fixture(),
        trigger,
        actorSide: "player",
        targetSide: "enemy",
        event: { action: { kind: "skill", skillId: "sk-no-such" }, activeSpriteId: "sp-no-such", sourceSpriteId: "sp-no-such", statusId: "no-such", markId: "no-such", weatherId: "no-such", reacted: false },
      } as unknown as MechanismContext;
      const scope = conditionScope(ctx);
      for (const def of defs) {
        if (def.trigger !== trigger) continue;
        if (!gatePasses(scope, def)) {
          gatedFalse++;
          expect(conditionsMatch(ctx, def.when), `${def.id} 门控假但 conditionsMatch 真（门控不安全）`).toBe(false);
        }
      }
    }
    // 门控必须真正在拦（身份不匹配事件下大量命中触发器的机制被跳过）。
    expect(gatedFalse).toBeGreaterThan(300);
  });

  it("骨架等价：门控版 collect 的（机制序, effectIndex）=== 不门控参照公式（含 oncePerTurn / priority）", () => {
    const registry = new MechanismRegistry(defs);
    // 不门控参照：trigger + conditionsMatch 直判 + oncePerTurn 门 + priority 排序（复刻 collect 骨架）。
    const reference = (ctx: MechanismContext): string[] => {
      const fired = ctx.trigger === "passive" ? undefined : ctx.state.onceFired;
      return defs
        .filter((definition) => definition.trigger === ctx.trigger && conditionsMatch(ctx, definition.when))
        .filter((definition) => {
          if (!definition.oncePerTurn || !fired) return true;
          const key = `${ctx.actorSide ?? "-"}:${definition.id}`;
          if (fired[key]) return false;
          fired[key] = true;
          return true;
        })
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
        .flatMap((definition) => definition.effects.map((_, effectIndex) => `${definition.id}#${effectIndex}`));
    };
    // 每触发器取样本、satisfy 其条件后双向收集（满足路径走门控通过分支；另取不匹配事件路径）。
    const seen = new Set<string>();
    const samples = defs.filter((def) => !seen.has(def.trigger) && seen.add(def.trigger));
    expect(samples.length).toBeGreaterThanOrEqual(12);
    for (const def of samples) {
      for (const makeEvent of [(e: Dict) => e, (e: Dict) => ({ ...e, action: { kind: "skill", skillId: "sk-no-such" } })]) {
        const state = cloneState(fixture());
        const event: Dict = {};
        const scope: Dict = { state, event, turn: state.turn, self: state.player, actor: state.player, target: state.enemy, opponent: state.enemy };
        def.when?.forEach((cond) => satisfy(cond, scope, true));
        const ctx = { state, trigger: def.trigger, actorSide: def.trigger === "battleStart" ? undefined : "player", targetSide: def.trigger === "battleStart" ? undefined : "enemy", event: makeEvent(event) } as MechanismContext;
        const a = registry.collect({ ...ctx, state: cloneState(state) }).map((command) => `${command.mechanismId}#${command.effectIndex}`);
        const b = reference({ ...ctx, state: cloneState(state) });
        expect(a, `${def.id}(${def.trigger})`).toEqual(b);
      }
    }
  });

  it("普查守卫：可门控（AND 脊有叶）机制数不低于阈值", () => {
    const gateable = defs.filter((def) => gateLeavesFor(def).length > 0).length;
    // 数据普查 2026-10-03：682/695；阈值留余量，跌破即复查数据 / 门控提取。
    expect(gateable).toBeGreaterThanOrEqual(650);
    expect(defs.length).toBeGreaterThanOrEqual(690);
  });
});
