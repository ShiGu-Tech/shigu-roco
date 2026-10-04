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

function fresh() {
  return makeState(
    makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 600, maxHp: 600, energy: 10 })),
  );
}

describe("content longtail (第四期)", () => {
  it("毒雾：敌方增益转为等量中毒", () => {
    const state = fresh();
    state.player.active.loadout = ["sk-7120130"];
    state.enemy.active.buffs = { atk: 3, defense: 2 };
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7120130" }, { kind: "energy" }, new Rng(1));
    expect(t.state.enemy.active.buffs.atk ?? 0).toBe(0);
    expect(t.state.enemy.active.buffs.defense ?? 0).toBe(0);
    expect(t.state.enemy.active.statuses.poison ?? 0).toBe(5);
  });

  it("落井下毒：敌方减益层数翻倍", () => {
    const state = fresh();
    state.player.active.loadout = ["sk-7120160"];
    state.enemy.active.debuffs = { atk: 3 };
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7120160" }, { kind: "energy" }, new Rng(1));
    expect(t.state.enemy.active.debuffs.atk).toBe(6);
  });

  it("杠杆置换：交换两侧技能位置并回能", () => {
    const state = fresh();
    const enemySkill = damagingSkill("sp-14-1");
    state.player.active.loadout = ["sk-7070050", "sk-7020550"];
    state.enemy.active.loadout = [enemySkill];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7070050" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.loadout).toEqual([enemySkill]);
    expect(t.state.enemy.active.loadout).toEqual(["sk-7070050", "sk-7020550"]);
  });

  it("排气：使用后敌方攻击威力 −20（含抵抗累积）", () => {
    const enemyAtk = damagingSkill("sp-14-1");
    const base = fresh();
    base.player.active.loadout = ["sk-7070260", "sk-7020550"];
    base.enemy.active.loadout = [enemyAtk];
    const baseT = new Simulator(bundle).step(base, { kind: "energy" }, { kind: "skill", skillId: enemyAtk }, new Rng(1));
    const baseDmg = baseT.events.filter((e) => e.type === "damage" && e.side === "player").reduce((s, e) => s + Number((e.data as Dict).value), 0);

    const withT = fresh();
    withT.player.active.loadout = ["sk-7070260", "sk-7020550"];
    withT.enemy.active.loadout = [enemyAtk];
    withT.player.active.counters = { exhaust: 1 };
    const t = new Simulator(bundle).step(withT, { kind: "energy" }, { kind: "skill", skillId: enemyAtk }, new Rng(1));
    const dmg = t.events.filter((e) => e.type === "damage" && e.side === "player").reduce((s, e) => s + Number((e.data as Dict).value), 0);
    expect(dmg).toBeLessThan(baseDmg);
  });
});
