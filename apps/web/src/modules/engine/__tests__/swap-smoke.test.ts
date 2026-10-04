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
  return makeState(
    makeSide(makeActive("sp-1-1", { hp: 100, maxHp: 400, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })),
  );
}

describe("swap smoke (C0-3)", () => {
  it("恶念交换：交换生命比例", () => {
    const state = fixture();
    apply("sk-7180230", state);
    expect(state.player.active.hp).toBe(Math.floor(400 * (300 / 300)));
    expect(state.enemy.active.hp).toBe(Math.floor(300 * (100 / 400)));
  });

  it("假冒：生命比例设为与敌方相同", () => {
    const state = fixture();
    apply("sk-7180440", state);
    expect(state.player.active.hp).toBe(Math.floor(400 * (300 / 300)));
    expect(state.enemy.active.hp).toBe(300);
  });

  it("欺诈契约：交换增益减益", () => {
    const state = fixture();
    state.player.active.buffs = { atk: 2 };
    state.enemy.active.debuffs = { defense: -3 };
    apply("sk-7180180", state);
    expect(state.player.active.debuffs).toEqual({ defense: -3 });
    expect(state.enemy.active.buffs).toEqual({ atk: 2 });
  });
});
