import { describe, expect, it } from "vitest";
import { effectiveCost } from "../cost";
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

function skillBy(pred: (s: Dict) => boolean): string {
  for (const s of Object.values(bundle.skills as Record<string, Dict>)) if (pred(s)) return String(s.id);
  throw new Error("no skill");
}

function wingAttack(): string {
  for (const s of Object.values(bundle.skills as Record<string, Dict>)) {
    if (s.element === "Wing" && (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0 && Number(s.cost) >= 2) return String(s.id);
  }
  throw new Error("no wing attack");
}

describe("structural: 展翅/异类/游弋/夺目/翻垃圾桶/瞳中倒影/噼啪噼啪/禁足", () => {
  it("展翅 / 异类 / 游弋 / 机械变式 / 瞳中倒影 / 风速仪：规则覆盖登记", () => {
    const rules = (name: string, key: string) => {
      const state = makeState(makeSide(makeActive(spriteWithTrait(name), { hp: 500, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1")));
      return new Simulator(bundle).mechanisms.ruleModifiers(state, bundle, "player")[key];
    };
    expect(rules("展翅", "element.normalToWing")).toBe(true);
    expect(rules("异类", "cost.wingAttack")).toBe(true);
    expect(rules("异类", "lifesteal.wingAttack")).toBe(true);
    expect(rules("游弋", "charge.defenseMul")).toBe(true);
    expect(rules("机械变式", "cost.slotChangePenalty")).toBe(true);
    expect(rules("瞳中倒影", "switch.swapHpRatio")).toBe(true);
    expect(rules("风速仪", "wind.tractionPerMark")).toBe(8);
    expect(rules("天通地明", "power.vsPolluted")).toBe(true);
  });

  it("异类：翼系攻击技能能耗 +1", () => {
    const trait = spriteWithTrait("异类");
    const skill = wingAttack();
    const base = Number((bundle.skills[skill] as Dict).cost);
    const state = makeState(makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1")));
    const sim = new Simulator(bundle);
    const mods = sim.mechanisms.ruleModifiers(state, bundle, "player");
    expect(effectiveCost(state, bundle, "player", skill, mods)).toBe(base + 1);
  });

  it("夺目：入场额外获得 3 个技能", () => {
    const trait = spriteWithTrait("夺目");
    const state = makeState(makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1")));
    state.player.active.loadout = [wingAttack()];
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.loadout.length).toBe(4);
  });

  it("翻垃圾桶：入场习得敌方最近技能且能耗 -2", () => {
    const trait = spriteWithTrait("翻垃圾桶");
    const skill = wingAttack();
    const base = Number((bundle.skills[skill] as Dict).cost);
    const state = makeState(makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1")));
    state.player.active.loadout = ["sk-7140180"];
    state.enemy.lastTurn = { skillId: skill };
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.loadout).toContain(skill);
    expect(effectiveCost(t.state, bundle, "player", skill)).toBe(base - 2);
  });

  it("瞳中倒影：敌方换入时交换血量百分比", () => {
    const trait = spriteWithTrait("瞳中倒影");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 50, maxHp: 100, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 10, maxHp: 100, energy: 20 }), { bench: [makeActive("sp-15-1", { hp: 100, maxHp: 100 })] }),
    );
    state.player.active.loadout = ["sk-7140180"];
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "switch", benchId: "sp-15-1" }, new Rng(1));
    expect(t.state.player.active.hp).toBe(100);
    expect(t.state.enemy.active.hp).toBe(50);
  });

  it("噼啪噼啪！：入场回合行动后回复 2 能量", () => {
    const trait = spriteWithTrait("噼啪噼啪！");
    const state = makeState(makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 1 })), makeSide(makeActive("sp-14-1")));
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.energy).toBe(8);
  });

  it("稀兽花宝：草系血脉入场回复 20% 生命", () => {
    const trait = spriteWithTrait("稀兽花宝");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 100, maxHp: 500, energy: 20, profile: { bloodline: "GRASS" } })),
      makeSide(makeActive("sp-14-1")),
    );
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.hp).toBeGreaterThanOrEqual(200);
  });

  it("稀兽花宝：幽系血脉入场 → 敌方能量 -2", () => {
    const trait = spriteWithTrait("稀兽花宝");
    const foe = skillBy((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.cost) <= 3);
    const cost = Number((bundle.skills[foe] as Dict).cost);
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20, profile: { bloodline: "GHOST" } })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.enemy.active.loadout = [foe];
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "skill", skillId: foe }, new Rng(1));
    expect(t.events.some((e) => e.type === "energy-modified" && e.data.delta === -2)).toBe(true);
    expect(t.state.enemy.active.energy).toBeLessThanOrEqual(10 - 2 - cost + 1);
  });

  it("泛音列：使用状态技能后敌方攻击技能能耗 +2（3 回合）", () => {
    const trait = spriteWithTrait("泛音列");
    const statusSkill = skillBy((s) => s.actionType === "Status");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [statusSkill];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: statusSkill }, { kind: "energy" }, new Rng(1));
    expect(t.state.enemy.active.costMods?.some((m) => m.scope === "attack" && m.delta === 2)).toBe(true);
  });

  it("张弛有度：周末加双攻 / 平日加双防", () => {
    const trait = spriteWithTrait("张弛有度");
    const base = () => {
      const state = makeState(makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1")));
      return state;
    };
    const sat = base();
    sat.dayOfWeek = 6;
    const t1 = new Simulator(bundle).step(sat, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.active.counters?.["pct-atk"]).toBe(0.4);
    const wed = base();
    wed.dayOfWeek = 3;
    const t2 = new Simulator(bundle).step(wed, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t2.state.player.active.counters?.["pct-defense"]).toBe(0.4);
  });

  it("有求必应：使用选择技后追加另一分支，且该技能冷却 1", () => {
    const trait = spriteWithTrait("有求必应");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 100, maxHp: 500, energy: 5 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = ["sk-7030600"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7030600", choice: 0 }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.hp).toBeGreaterThanOrEqual(225);
    expect(t.state.player.active.energy).toBeGreaterThan(5);
    expect(t.state.player.active.cooldowns?.["sk-7030600"] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("一意孤行：使用选择技后追加相同分支", () => {
    const trait = spriteWithTrait("一意孤行");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 100, maxHp: 500, energy: 5 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = ["sk-7030600"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7030600", choice: 0 }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.hp).toBeGreaterThanOrEqual(350);
  });

  it("不朽：力竭 4 回合后复活", () => {
    const trait = spriteWithTrait("不朽");
    const state = makeState(makeSide(makeActive(trait, { hp: 0, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })));
    const sim = new Simulator(bundle);
    let r = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(r.state.player.active.reviveDue).toBe(5);
    for (let i = 0; i < 4; i++) r = sim.step(r.state, { kind: "energy" }, { kind: "energy" }, new Rng(2 + i));
    expect(r.state.player.active.hp).toBe(500);
  });

  it("禁足：离场锁期间无法换人（legalActions 无 switch）", () => {
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 }), { bench: [makeActive("sp-15-1", { hp: 100, maxHp: 100 })] }),
      makeSide(makeActive("sp-14-1")),
    );
    state.player.active.statuses.rooted = 1;
    const actions = new Simulator(bundle).legalActions(state, "player");
    expect(actions.some((a) => a.kind === "switch")).toBe(false);
  });
});
