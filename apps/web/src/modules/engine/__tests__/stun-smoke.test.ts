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

describe("stun smoke (C0-2)", () => {
  it("眩晕时跳过行动并清零", () => {
    const state = makeState(
      makeSide(makeActive("sp-1-1", { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    state.player.active.counters = { stun: 1 };
    const r = new Simulator(bundle).step(state, { kind: "skill", skillId: damagingSkill("sp-1-1") }, { kind: "skill", skillId: damagingSkill("sp-14-1") }, new Rng(1));
    expect(r.events.some((e) => e.type === "stun")).toBe(true);
    expect(r.state.enemy.active.hp).toBe(400);
    expect(r.state.player.active.counters?.stun ?? 0).toBe(0);
  });
});
