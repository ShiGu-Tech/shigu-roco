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

describe("energy hooks smoke (H)", () => {
  it("腐植循环：每回复 1 能量回复 5% 生命", () => {
    const id = spriteWithTrait("腐植循环");
    const state = makeState(
      makeSide(makeActive(id, { hp: 200, maxHp: 400, energy: 0 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.counters?.charges).toBe(1);
    // 聚能 +5 → 生命 200 + 400×0.05×5 = 300
    expect(t1.state.player.active.hp).toBe(300);
  });
});


