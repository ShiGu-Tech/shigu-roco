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

describe("switch hooks smoke (P7/P8)", () => {
  it("木桶戏法：离场后换入的精灵以木桶状态登场", () => {
    const id = spriteWithTrait("木桶戏法");
    const state = makeState(
      makeSide(makeActive(id, { hp: 300, maxHp: 300, energy: 10 }), { bench: [makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })] }),
      makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })),
    );
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "switch", benchId: "sp-14-1" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.active.spriteId).toBe("sp-14-1");
    expect(t1.state.player.active.statuses["wooden-barrel-state"]).toBe(1);
  });
});
