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

describe("mark/status rewrite smoke (P3)", () => {
  it("蚀刻：回合末敌方每 2 层中毒转为 1 层中毒印记", () => {
    const id = spriteWithTrait("蚀刻");
    const state = makeState(
      makeSide(makeActive(id, { hp: 200, maxHp: 200, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 200, maxHp: 200, energy: 10 })),
    );
    state.enemy.active.statuses.poison = 4;
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.enemy.active.marks["poison-mark"]).toBe(2);
  });
});
