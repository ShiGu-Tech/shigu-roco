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

describe("defense skill smoke (C2)", () => {
  it("冰墙：应对攻击 → forceFirst + 护盾 + 敌方冻结", () => {
    const state = fixture();
    const cmds = registryFor("sk-7090210").collect({
      state,
      trigger: "actionDeclared",
      event: { action: { skillId: "sk-7090210" }, opponentAction: { kind: "skill", skillId: "x", actionType: "Attack" } },
      actorSide: "player",
      targetSide: "enemy",
    });
    const types = cmds.map((c) => c.type);
    expect(types).toContain("forceFirst");
    expect(types).toContain("applyStatus");
    const freeze = cmds.find((c) => c.type === "applyStatus" && (c.definition as { statusId?: string }).statusId === "freeze");
    expect(freeze).toBeTruthy();
  });

  it("冰墙：护盾状态 → beforeDamage 减伤 80%", () => {
    const state = fixture();
    state.player.active.statuses["def-7090210"] = 1;
    const cmds = registryFor("sk-7090210").collect({
      state,
      trigger: "beforeDamage",
      event: { damageType: "Physical" },
      actorSide: "enemy",
      targetSide: "player",
    });
    const reduce = cmds.find((c) => c.type === "setDamageReduction");
    expect(reduce).toBeTruthy();
    expect((reduce?.definition as { percent?: number }).percent).toBe(80);
  });

  it("硬门：应对攻击 → 打断 + 90 威力物伤", () => {
    const state = fixture();
    const cmds = registryFor("sk-7140180").collect({
      state,
      trigger: "actionDeclared",
      event: { action: { skillId: "sk-7140180" }, opponentAction: { kind: "skill", skillId: "x", actionType: "Attack" } },
      actorSide: "player",
      targetSide: "enemy",
    });
    const types = cmds.map((c) => c.type);
    expect(types).toContain("forceFirst");
    expect(types).toContain("cancelAction");
    expect(types).toContain("dealDamage");
  });

  it("集中：护盾存在时回合末返场", () => {
    const state = fixture();
    state.player.active.statuses["def-7110280"] = 1;
    const cmds = registryFor("sk-7110280").collect({
      state,
      trigger: "turnEnd",
      event: {},
      actorSide: "player",
      targetSide: "player",
    });
    const types = cmds.map((c) => c.type);
    expect(types).toContain("removeStatus");
    expect(types).toContain("escape");
  });
});
