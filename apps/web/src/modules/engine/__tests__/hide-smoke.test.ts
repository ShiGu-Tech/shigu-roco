import { describe, expect, it } from "vitest";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();

function fixture(): BattleState {
  return makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
}

describe("info-hide smoke (C0-11)", () => {
  it("木桶状态：自己行动后解除", () => {
    const state = fixture();
    state.player.active.statuses["wooden-barrel-state"] = 1;
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "status:wooden-barrel-state:on-act");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "actionResolved", event: {}, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    expect(state.player.active.statuses["wooden-barrel-state"]).toBeUndefined();
  });

  it("月陨星状态：受到攻击后解除", () => {
    const state = fixture();
    state.enemy.active.statuses["moonfall-star-state"] = 1;
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "status:moonfall-star-state:on-hit");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "afterDamage", event: {}, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    expect(state.enemy.active.statuses["moonfall-star-state"]).toBeUndefined();
  });
});
