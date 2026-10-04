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
  return makeState(makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })), makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })));
}

function collect(ownerId: string, state: BattleState, choice?: 0 | 1) {
  const action = choice === undefined ? { skillId: ownerId } : { skillId: ownerId, choice };
  return registryFor(ownerId).collect({ state, trigger: "beforeAction", event: { action }, actorSide: "player", targetSide: "enemy" });
}

describe("choice smoke (A2)", () => {
  it("野火 明 → 敌方灼烧；暗 → 敌方物防 −90%", () => {
    const light = collect("sk-7040660", fixture(), 0);
    expect(light.some((c) => c.type === "applyStatus" && (c.definition as { statusId?: string }).statusId === "burn")).toBe(true);
    const dark = collect("sk-7040660", fixture(), 1);
    const stat = dark.find((c) => c.type === "modifyStat");
    expect((stat?.definition as { value?: number }).value).toBe(-90);
  });

  it("缺省 choice 等价明", () => {
    const cmds = collect("sk-7040660", fixture());
    expect(cmds.some((c) => c.type === "applyStatus")).toBe(true);
    expect(cmds.some((c) => c.type === "modifyStat")).toBe(false);
  });

  it("补觉 明 → 回血；暗 → 回能", () => {
    expect(collect("sk-7030600", fixture(), 0).some((c) => c.type === "heal")).toBe(true);
    expect(collect("sk-7030600", fixture(), 1).some((c) => c.type === "modifyEnergy")).toBe(true);
  });
});
