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

describe("carry elements smoke (D3)", () => {
  it("偏振：受到携带系别技能伤害时减伤", () => {
    const id = spriteWithTrait("偏振");
    const state = makeState(
      makeSide(makeActive(id, { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    // 双方都用普通系技能（抓挠），使目标携带系别含 Normal。
    state.player.active.loadout = ["sk-7020360"];
    state.enemy.active.loadout = ["sk-7020360"];
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "energy" }, { kind: "skill", skillId: "sk-7020360" }, new Rng(1));
    expect(t1.state.player.active.carryElements).toContain("Normal");
    const dmg = t1.events.find((e) => e.type === "damage" && e.side === "player");
    expect(dmg).toBeTruthy();
    expect((dmg!.data.modifiers as Dict | undefined)?.reduction ?? 0).toBeGreaterThanOrEqual(40);
  });
});
