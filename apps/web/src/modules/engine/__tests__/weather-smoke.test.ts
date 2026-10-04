import { describe, expect, it } from "vitest";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();

function apply(ownerId: string, state: BattleState) {
  const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.ownerId === ownerId);
  const registry = new MechanismRegistry(defs);
  const runtime = new MechanismRuntime(registry);
  const cmds = registry.collect({ state, trigger: "beforeAction", event: { action: { skillId: ownerId } }, actorSide: "player", targetSide: "enemy" });
  return runtime.applyStateCommands(state, cmds, bundle);
}

function fixture(): BattleState {
  const s = makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
  s.weather = { id: "rain", turnsLeft: 3 };
  return s;
}

describe("weather extend smoke (C0-5)", () => {
  it("汇流：雨天 +4 回合", () => {
    const state = fixture();
    apply("sk-7050530", state);
    expect(state.weather?.turnsLeft).toBe(7);
  });
});
