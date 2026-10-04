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

function damagingSkill(spriteId: string): string {
  for (const id of (bundle.sprites[spriteId]?.skillList as string[]) ?? []) {
    const skill = bundle.skills[id];
    if (skill && (skill.category === "Physical" || skill.category === "Magic") && Number(skill.power) > 0) return id;
  }
  throw new Error("no damaging skill");
}

describe("stat rewrite smoke (P4)", () => {
  it("灰色肖像：攻击使敌方已有减益层数 +3", () => {
    const id = spriteWithTrait("灰色肖像");
    const state = makeState(
      makeSide(makeActive(id, { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    const atk = damagingSkill(id);
    state.player.active.loadout = [atk];
    state.enemy.active.debuffs.atk = 2;
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "skill", skillId: atk }, { kind: "energy" }, new Rng(1));
    expect(t1.state.enemy.active.debuffs.atk).toBe(5);
  });
});
