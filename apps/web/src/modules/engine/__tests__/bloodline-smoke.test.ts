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

describe("bloodline smoke (D9)", () => {
  it("月光审判：敌方首领血脉时威力翻倍", () => {
    const id = spriteWithTrait("月光审判");
    const atk = damagingSkill(id);
    const state = makeState(
      makeSide(makeActive(id, { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 600, maxHp: 600, energy: 10 })),
    );
    state.player.active.loadout = [atk];
    state.enemy.active.profile = { bloodline: "leader" };
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "skill", skillId: atk }, { kind: "energy" }, new Rng(1));
    const dmg = t1.events.find((e) => e.type === "damage" && e.side === "enemy");
    expect(dmg).toBeTruthy();
    expect((dmg!.data.modifiers as Dict | undefined)?.attackerMult ?? 1).toBeGreaterThanOrEqual(2);
  });
});
