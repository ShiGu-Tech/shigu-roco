import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function damagingSkill(spriteId: string): string {
  for (const id of (bundle.sprites[spriteId]?.skillList as string[]) ?? []) {
    const skill = bundle.skills[id];
    if (skill && Number(skill.power) > 0) return id;
  }
  throw new Error("no damaging skill");
}

function totalDamage(events: { type: string; side?: string | null; data: Dict }[]): number {
  return events.filter((e) => e.type === "damage" && e.side === "enemy").reduce((s, e) => s + Number(e.data.value ?? 0), 0);
}

function run(extra: number) {
  const atk = damagingSkill("sp-8-1");
  const state = makeState(
    makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 9999, maxHp: 9999, energy: 10 })),
  );
  state.player.active.loadout = [atk];
  if (extra) state.player.active.counters = { extraUses: extra };
  return new Simulator(bundle).step(state, { kind: "skill", skillId: atk }, { kind: "energy" }, new Rng(1));
}

describe("使用次数 +1", () => {
  it("携带 extraUses 时技能额外执行一次（不重复耗能）", () => {
    const base = run(0);
    const extra = run(1);
    expect(totalDamage(extra.events as never)).toBeGreaterThan(totalDamage(base.events as never));
    expect(extra.state.player.active.energy).toBe(base.state.player.active.energy);
  });
});
