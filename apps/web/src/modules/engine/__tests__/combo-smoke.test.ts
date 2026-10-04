import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

function damagingSkill(spriteId: string): string {
  const sprite = bundle.sprites[spriteId];
  for (const id of (sprite?.skillList as string[]) ?? []) {
    const skill = bundle.skills[id];
    if (skill && (skill.category === "Physical" || skill.category === "Magic") && Number(skill.power) > 0) return id;
  }
  throw new Error("no damaging skill for " + spriteId);
}

function hitCount(counters?: Record<string, number>): number {
  const ps = damagingSkill("sp-1-1");
  const es = damagingSkill("sp-14-1");
  const state = makeState(
    makeSide(makeActive("sp-1-1", { hp: 400, maxHp: 400, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
  );
  if (counters) state.player.active.counters = counters;
  const r = new Simulator(bundle).step(state, { kind: "skill", skillId: ps }, { kind: "skill", skillId: es }, new Rng(1));
  const dmg = r.events.find((e) => e.type === "damage" && e.side === "enemy");
  return Number((dmg?.data.breakdown as { hits?: number } | undefined)?.hits ?? 0);
}

describe("combo buff smoke (C0-1)", () => {
  it("默认 1 段", () => {
    expect(hitCount()).toBe(1);
  });
  it("combo-add +2 → 3 段", () => {
    expect(hitCount({ "combo-add": 2 })).toBe(3);
  });
  it("combo-mul +100% → 2 段", () => {
    expect(hitCount({ "combo-mul": 1 })).toBe(2);
  });
  it("combo-add +1 且 combo-mul +100% → (1+1)*2 = 4 段", () => {
    expect(hitCount({ "combo-add": 1, "combo-mul": 1 })).toBe(4);
  });
});
