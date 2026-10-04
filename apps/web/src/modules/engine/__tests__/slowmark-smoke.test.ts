import { describe, expect, it } from "vitest";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();

function fixture(): BattleState {
  return makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
}

describe("slow-mark smoke (C0-6)", () => {
  it("减速印记：获得时速度 −10", () => {
    const state = fixture();
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "mark:slow-mark");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "markApplied", event: { markId: "slow-mark", before: 0, after: 2 }, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    expect(state.player.active.debuffs.speed).toBe(-10);
  });
});
