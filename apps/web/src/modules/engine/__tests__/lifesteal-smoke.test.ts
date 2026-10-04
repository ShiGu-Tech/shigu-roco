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
  throw new Error("no damaging skill");
}

function run(lifesteal?: number) {
  const state = makeState(
    makeSide(makeActive("sp-1-1", { hp: 200, maxHp: 400, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
  );
  if (lifesteal) state.player.active.counters = { lifesteal };
  const r = new Simulator(bundle).step(state, { kind: "skill", skillId: damagingSkill("sp-1-1") }, { kind: "skill", skillId: damagingSkill("sp-14-1") }, new Rng(1));
  return r;
}

describe("lifesteal smoke (C0-4)", () => {
  it("吸血：按造成伤害回复自身生命（相比无吸血更多）", () => {
    const withLs = run(0.5);
    expect(withLs.events.some((e) => e.type === "lifesteal")).toBe(true);
    expect(withLs.state.player.active.hp).toBeGreaterThan(run().state.player.active.hp);
  });
});
