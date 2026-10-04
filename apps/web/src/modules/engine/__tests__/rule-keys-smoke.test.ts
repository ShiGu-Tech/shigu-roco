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

describe("rule keys smoke (D2)", () => {
  it("煤渣草：灼烧衰减变为增长", () => {
    const id = spriteWithTrait("煤渣草");
    const state = makeState(
      makeSide(makeActive(id, { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.enemy.active.statuses.burn = 4;
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    // 4 层灼烧本应衰减为 2，煤渣草令其增长为 6
    expect(t1.state.enemy.active.statuses.burn).toBe(6);
  });
});
