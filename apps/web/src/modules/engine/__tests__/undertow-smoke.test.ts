import { describe, expect, it } from "vitest";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();

describe("undertow smoke (A5)", () => {
  it("暗涌印记：换入时获得 5 层随机属性减益", () => {
    const state: BattleState = makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
    state.player.active.marks["undertow-mark"] = 1;
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "mark:undertow-mark");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "afterSwitch", event: {}, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    const total = Object.values(state.player.active.debuffs).reduce((s, v) => s + Math.abs(v), 0);
    expect(total).toBe(5);
  });
});
