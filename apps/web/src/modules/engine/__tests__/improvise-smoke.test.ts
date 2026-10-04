import { describe, expect, it } from "vitest";
import { effectiveCost } from "../cost";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import { toNum } from "../types";
import type { BattleState } from "../types";

const bundle = getBundle();

function fixture(): BattleState {
  return makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
}

describe("improvise smoke (C0-9)", () => {
  it("巧变：使用后变为随机技能且能耗 −1，能耗修正记入 override", () => {
    const state = fixture();
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "skill:sk-7120300:improvise");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "skillUsed", event: { skillId: "sk-7120300" }, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    expect(state.player.active.loadout).not.toContain("sk-7120300");
    const picked = Object.keys(state.player.active.skillOverrides ?? {})[0];
    expect(picked).toBeTruthy();
    const base = toNum(bundle.skills[picked]?.cost, 0);
    expect(effectiveCost(state, bundle, "player", picked)).toBe(Math.max(0, base - 1));
  });
});
