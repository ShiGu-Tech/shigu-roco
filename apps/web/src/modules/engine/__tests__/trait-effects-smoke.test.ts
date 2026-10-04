import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function spriteWithTrait(name: string): string {
  const hit = Object.entries(bundle.sprites as Record<string, Dict>).find(([, v]) => (v.trait as Dict | undefined)?.name === name);
  if (!hit) throw new Error(`no sprite with trait ${name}`);
  return hit[0];
}

function damagingSkill(spriteId: string): string {
  for (const id of (bundle.sprites[spriteId]?.skillList as string[]) ?? []) {
    const s = bundle.skills[id];
    if (s && Number(s.power) > 0) return id;
  }
  throw new Error("no skill");
}

function damageTo(events: { type: string; side?: string | null; data: Dict }[], side: string): number {
  return events.filter((e) => e.type === "damage" && e.side === side).reduce((sum, e) => sum + Number(e.data.value ?? 0), 0);
}

describe("trait effects", () => {
  it("复方汤剂：双方中毒额外触发一次", () => {
    const trait = spriteWithTrait("复方汤剂");
    const run = (sprite: string) => {
      const state = makeState(
        makeSide(makeActive(sprite, { hp: 1000, maxHp: 1000, energy: 10 })),
        makeSide(makeActive("sp-14-1", { hp: 1000, maxHp: 1000, energy: 10 })),
      );
      state.player.active.statuses = { poison: 3 };
      return new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    };
    expect(damageTo(run(trait).events as never, "player")).toBeGreaterThan(damageTo(run("sp-8-1").events as never, "player"));
  });

  it("守望星：触发星陨印记仅消耗一半层数", () => {
    const trait = spriteWithTrait("守望星");
    const atk = Object.values(bundle.skills as Record<string, Dict>).find(
      (s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0 && s.element !== "Psychic",
    ) as { id: string };
    const run = (sprite: string) => {
      const state = makeState(
        makeSide(makeActive(sprite, { hp: 5000, maxHp: 5000, energy: 20 })),
        makeSide(makeActive("sp-14-1", { hp: 5000, maxHp: 5000, energy: 10 })),
      );
      state.player.active.loadout = [atk.id];
      state.enemy.active.marks = { "starfall-mark": 4 };
      return new Simulator(bundle).step(state, { kind: "skill", skillId: atk.id }, { kind: "energy" }, new Rng(1));
    };
    expect(run(trait).state.enemy.active.marks?.["starfall-mark"] ?? 0).toBe(2);
    expect(run("sp-8-1").state.enemy.active.marks?.["starfall-mark"] ?? 0).toBe(0);
  });

  it("展翅：后于敌方行动时受伤 +25%", () => {
    const trait = spriteWithTrait("展翅");
    const atk = damagingSkill("sp-14-1");
    const run = (sprite: string) => {
      const state = makeState(
        makeSide(makeActive(sprite, { hp: 5000, maxHp: 5000, energy: 10 })),
        makeSide(makeActive("sp-14-1", { hp: 5000, maxHp: 5000, energy: 20 })),
      );
      state.enemy.active.loadout = [atk];
      state.enemy.active.buffs = { speed: 10 }; // 确保敌方先手
      return new Simulator(bundle).step(state, { kind: "energy" }, { kind: "skill", skillId: atk }, new Rng(1));
    };
    expect(damageTo(run(trait).events as never, "player")).toBeGreaterThan(damageTo(run("sp-8-1").events as never, "player"));
  });
});
