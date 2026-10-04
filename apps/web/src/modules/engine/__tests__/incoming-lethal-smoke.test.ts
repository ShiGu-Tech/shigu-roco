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

describe("incoming lethal smoke (incremental)", () => {
  it("预警：敌方足以击败自己时标记 incomingLethal", () => {
    const id = spriteWithTrait("预警");
    const state = makeState(
      makeSide(makeActive(id, { hp: 1, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.counters?.incomingLethal).toBe(1);
  });
});
