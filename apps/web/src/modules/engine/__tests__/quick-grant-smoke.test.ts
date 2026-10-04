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

function nonQuickSkill(): string {
  for (const s of Object.values(bundle.skills as Record<string, Dict>)) {
    if (Number(s.cost) <= 5 && !((s.tags as string[] | undefined) ?? []).includes("quick") && (s.category === "Physical" || s.category === "Magic")) return String(s.id);
  }
  throw new Error("no skill");
}

describe("迅捷剩余", () => {
  it("起飞加速：本场首次使用的技能之后永久迅捷（再次换入即出手）", () => {
    const trait = spriteWithTrait("起飞加速");
    const skill = nonQuickSkill();
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 }), { bench: [makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })] }),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [skill];
    const sim = new Simulator(bundle);
    let s = sim.step(state, { kind: "skill", skillId: skill }, { kind: "energy" }, new Rng(1)).state;
    s = sim.step(s, { kind: "switch", benchId: "sp-14-1" }, { kind: "energy" }, new Rng(2)).state;
    const t = sim.step(s, { kind: "switch", benchId: trait }, { kind: "energy" }, new Rng(3));
    expect(t.phaseLogs.some((line) => line.includes(skill))).toBe(true);
  });

  it("飓风：队友翼系精灵携带相同技能 → 换入即出手", () => {
    const wind = spriteWithTrait("飓风");
    const wingMate = Object.entries(bundle.sprites as Record<string, Dict>).find(
      ([id, v]) => id !== wind && ((v.elements as string[] | undefined) ?? []).includes("Wing"),
    )?.[0];
    if (!wingMate) throw new Error("no wing sprite");
    const skill = nonQuickSkill();
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 20 }), {
        bench: [makeActive(wind, { hp: 500, maxHp: 500, energy: 20 }), makeActive(wingMate, { hp: 500, maxHp: 500, energy: 20 })],
      }),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.bench[0].loadout = [skill];
    state.player.bench[1].loadout = [skill];
    const t = new Simulator(bundle).step(state, { kind: "switch", benchId: wind }, { kind: "energy" }, new Rng(1));
    expect(t.phaseLogs.some((line) => line.includes(skill))).toBe(true);
  });
});
