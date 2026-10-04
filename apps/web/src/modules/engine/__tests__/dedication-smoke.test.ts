import { describe, expect, it } from "vitest";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();

function fixture(): BattleState {
  return makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
}

describe("dedication smoke (A4)", () => {
  it("啃咬：使用前消耗一个奉献并记入一次性威力", () => {
    const state = fixture();
    state.player.dedications = [{ key: "power", value: 20 }];
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "skill:sk-7130100:dedication");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "actionDeclared", event: { action: { skillId: "sk-7130100" } }, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    expect(state.player.dedications?.length).toBe(0);
    expect(state.player.active.counters?.["ded-power"]).toBe(20);
  });

  it("飞断：获得一个威力奉献入库", () => {
    const state = fixture();
    const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.id === "skill:sk-7130110");
    const registry = new MechanismRegistry(defs);
    const runtime = new MechanismRuntime(registry);
    const cmds = registry.collect({ state, trigger: "beforeAction", event: { action: { skillId: "sk-7130110" } }, actorSide: "player", targetSide: "enemy" });
    runtime.applyStateCommands(state, cmds, bundle);
    expect(state.player.dedications).toEqual([{ key: "power", value: 20 }]);
  });
});
