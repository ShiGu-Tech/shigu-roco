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

describe("friendship fruit smoke (incremental)", () => {
  it("友谊之果：回合结束双方所有精灵回复 1 能量", () => {
    const id = spriteWithTrait("友谊之果");
    const state = makeState(
      makeSide(makeActive(id, { hp: 300, maxHp: 300, energy: 5 }), { bench: [makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 0 })] }),
      makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 5 })),
    );
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.bench[0].energy).toBe(1);
  });
});
