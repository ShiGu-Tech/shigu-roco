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

describe("fatal guard smoke (P2)", () => {
  it("不死鸟：致命伤害保留 1 血并给敌方 15 层灼烧", () => {
    const id = spriteWithTrait("不死鸟");
    const state = makeState(
      makeSide(makeActive(id, { hp: 100, maxHp: 100, energy: 5 })),
      makeSide(makeActive("sp-14-1", { hp: 100, maxHp: 100, energy: 5 })),
    );
    state.player.active.hp = 0;
    const sim = new Simulator(bundle);
    sim.handleFaints(state);
    expect(state.player.active.hp).toBe(1);
    expect(state.player.active.faintHandled).toBe(false);
    expect(state.player.magic).toBe(4);
    expect(state.enemy.active.statuses.burn).toBe(15);
  });
});
