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

describe("element/weather conditions smoke (P5)", () => {
  it("流沙统治者：沙暴天气入场获速度 +50%", () => {
    const id = spriteWithTrait("流沙统治者");
    const state = makeState(
      makeSide(makeActive(id, { hp: 300, maxHp: 300, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })),
    );
    state.weather = { id: "sandstorm", turnsLeft: 3 };
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.active.buffs.speed).toBeCloseTo(0.5, 5);
  });
});
