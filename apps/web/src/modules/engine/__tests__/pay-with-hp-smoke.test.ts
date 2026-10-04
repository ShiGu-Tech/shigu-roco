import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function spriteWithTrait(name: string): string {
  for (const [id, sp] of Object.entries(bundle.sprites as Record<string, Dict>)) {
    if ((sp.trait as Dict | undefined)?.name === name) return id;
  }
  throw new Error(`no sprite with trait ${name}`);
}

function costedSkill(spriteId: string): { id: string; cost: number } {
  for (const id of (bundle.sprites[spriteId]?.skillList as string[]) ?? []) {
    const skill = bundle.skills[id] as Dict | undefined;
    const c = Number(skill?.cost) || 0;
    const desc = String(skill?.description ?? "");
    if (c >= 1 && !/吸血|回复|治疗/.test(desc)) return { id, cost: c };
  }
  throw new Error("no costed skill");
}

describe("pay with hp smoke (incremental)", () => {
  it("盛宴：能量不足时以生命代替能耗", () => {
    const id = spriteWithTrait("盛宴");
    const { id: skill, cost } = costedSkill(id);
    const state = makeState(
      makeSide(makeActive(id, { hp: 400, maxHp: 400, energy: 0 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    state.player.active.loadout = [skill];
    const sim = new Simulator(bundle);
    const mods = sim.mechanisms.ruleModifiers(state, bundle, "player");
    expect(mods["cost.payWithHp"]).toBe(true);
    const t1 = sim.step(state, { kind: "skill", skillId: skill }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.active.energy).toBe(0);
    expect(t1.state.player.active.hp).toBe(400 - Math.round(400 * 0.05 * cost));
  });
});
