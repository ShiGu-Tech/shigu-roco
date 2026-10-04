import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("spread energy smoke (D5)", () => {
  it("富养化：场下每只回复 3 能量", () => {
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 }), { bench: [makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 0 })] }),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7030510"];
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "skill", skillId: "sk-7030510" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.bench[0].energy).toBe(3);
  });
});
