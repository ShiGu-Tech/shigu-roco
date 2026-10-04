import { describe, expect, it } from "vitest";
import { MechanismRegistry, type MechanismDefinition } from "../mechanisms";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();

function registryFor(ownerId: string): MechanismRegistry {
  const defs = ((bundle.mechanisms ?? []) as unknown as MechanismDefinition[]).filter((m) => m.ownerId === ownerId);
  return new MechanismRegistry(defs);
}

function fixture(): BattleState {
  return makeState(
    makeSide(makeActive("sp-1-1", { hp: 400, maxHp: 400, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
  );
}

describe("mark smoke (C1)", () => {
  it("攻击印记：beforeDamage outgoing ×1.1", () => {
    const state = fixture();
    state.player.active.marks["attack-mark"] = 1;
    const cmds = registryFor("attack-mark").collect({ state, trigger: "beforeDamage", event: { damageType: "Physical" }, actorSide: "player", targetSide: "enemy" });
    const dmg = cmds.find((c) => c.type === "modifyDamage");
    expect((dmg?.definition as { value?: number }).value).toBe(1.1);
  });

  it("风起印记：先手时 +20%", () => {
    const state = fixture();
    state.player.active.marks["wind-mark"] = 1;
    const cmds = registryFor("wind-mark").collect({ state, trigger: "beforeDamage", event: { damageType: "Magic", wentFirst: true }, actorSide: "player", targetSide: "enemy" });
    expect(cmds.some((c) => c.type === "modifyDamage")).toBe(true);
  });

  it("湿润印记：beforeAction 全技能能耗 −1", () => {
    const state = fixture();
    state.player.active.marks["wet-mark"] = 1;
    const cmds = registryFor("wet-mark").collect({ state, trigger: "beforeAction", event: { action: { skillId: "sk-1" } }, actorSide: "player", targetSide: "enemy" });
    const cost = cmds.find((c) => c.type === "modifySkillCost");
    expect((cost?.definition as { delta?: number }).delta).toBe(-1);
  });

  it("中毒印记：turnEnd 3% 毒伤", () => {
    const state = fixture();
    state.player.active.marks["poison-mark"] = 1;
    const cmds = registryFor("poison-mark").collect({ state, trigger: "turnEnd", event: {}, actorSide: "player", targetSide: "player" });
    const dmg = cmds.find((c) => c.type === "dealDamage");
    expect((dmg?.definition as { amount?: number }).amount).toBe(0.03);
  });

  it("光合印记：turnEnd +1 能量", () => {
    const state = fixture();
    state.player.active.marks["photosynthesis-mark"] = 1;
    const cmds = registryFor("photosynthesis-mark").collect({ state, trigger: "turnEnd", event: {}, actorSide: "player", targetSide: "player" });
    const en = cmds.find((c) => c.type === "modifyEnergy");
    expect((en?.definition as { delta?: number }).delta).toBe(1);
  });
});
