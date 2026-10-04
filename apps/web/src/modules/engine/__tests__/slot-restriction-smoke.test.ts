import { describe, expect, it } from "vitest";
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

describe("slot restriction smoke (P6)", () => {
  it("正位宝剑：只列出 1 号位技能", () => {
    const id = spriteWithTrait("正位宝剑");
    const list = (bundle.sprites[id]?.skillList as string[]) ?? [];
    const loadout = list.filter((s) => bundle.skills[s]).slice(0, 2);
    expect(loadout.length).toBeGreaterThanOrEqual(2);
    const state = makeState(
      makeSide(makeActive(id, { hp: 300, maxHp: 300, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })),
    );
    state.player.active.loadout = loadout;
    const sim = new Simulator(bundle);
    const skills = sim.legalActions(state, "player").filter((a) => a.kind === "skill");
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((a) => a.skillId === loadout[0])).toBe(true);
  });
});
