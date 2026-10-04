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

describe("batch: 打断 / 元素链 / 免蓄力", () => {
  it("威慑：打断敌方时双攻 +30%、被打断技能冷却 +2", () => {
    const trait = spriteWithTrait("威慑");
    const atk = skillBy((s) => s.actionType === "Attack" && (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0);
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = ["sk-7140180"]; // 硬门：应对攻击 → 打断
    state.enemy.active.loadout = [atk];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7140180" }, { kind: "skill", skillId: atk }, new Rng(1));
    expect(t.state.enemy.active.cooldowns?.[atk] ?? 0).toBeGreaterThanOrEqual(2);
    expect((t.state.player.active.buffs.atk ?? 0) + (t.state.player.active.buffs.spatk ?? 0)).toBeGreaterThan(0);
  });

  it("大雪球：使用 2 次不同冰系技能 → 敌方 4 层冻结", () => {
    const trait = spriteWithTrait("大雪球");
    const ice = (Object.values(bundle.skills as Record<string, Dict>).filter((s) => s.element === "Ice").map((s) => String(s.id)));
    const [iceA, iceB] = ice;
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [iceA, iceB];
    const sim = new Simulator(bundle);
    let s = sim.step(state, { kind: "skill", skillId: iceA }, { kind: "energy" }, new Rng(1)).state;
    s = sim.step(s, { kind: "skill", skillId: iceB }, { kind: "energy" }, new Rng(2)).state;
    expect(s.enemy.active.statuses.freeze ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("石天平：能耗高于敌方 → 回合末敌方失去差值能量", () => {
    const trait = spriteWithTrait("石天平");
    const skill = skillBy((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0 && Number(s.cost) >= 1 && Number(s.cost) <= 5);
    const cost = Number((bundle.skills[skill] as Dict).cost);
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.player.active.loadout = [skill];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: skill }, { kind: "energy" }, new Rng(1));
    expect(t.state.enemy.active.energy).toBe(10 - cost);
  });

  it("合拍：与敌方同项越多，物攻/物防永久加成越高", () => {
    const trait = spriteWithTrait("合拍");
    const skill = skillBy((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0);
    const state = makeState(
      makeSide(makeActive(trait, { hp: 5000, maxHp: 5000, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 5000, maxHp: 5000, energy: 20 })),
    );
    state.player.active.loadout = [skill];
    state.enemy.active.loadout = [skill];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: skill }, { kind: "skill", skillId: skill }, new Rng(1));
    expect(t.state.player.active.counters?.["pct-atk"] ?? 0).toBeGreaterThan(0);
  });

  it("基因编辑：基础能耗 = 上回合双方技能能耗之和", () => {
    const trait = spriteWithTrait("基因编辑");
    const skill = skillBy((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0);
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.lastTurn = { cost: 3 };
    state.enemy.lastTurn = { cost: 2 };
    const sim = new Simulator(bundle);
    const mods = sim.mechanisms.ruleModifiers(state, bundle, "player");
    expect(effectiveCost(state, bundle, "player", skill, mods)).toBe(5);
  });

  it("盗魂铃：初始能量 0，且在场回复能量 −4", () => {
    const trait = spriteWithTrait("盗魂铃");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.energy).toBe(1);
  });

  it("龙守望：下一次技能无需蓄力（吹炎立即释放）", () => {
    const chargeSkill = "sk-7100130"; // 吹炎
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = ["sk-7100300", chargeSkill];
    const sim = new Simulator(bundle);
    const s = sim.step(state, { kind: "skill", skillId: "sk-7100300" }, { kind: "energy" }, new Rng(1)).state;
    const t = sim.step(s, { kind: "skill", skillId: chargeSkill }, { kind: "energy" }, new Rng(2));
    expect(t.events.some((e) => e.type === "damage" && e.side === "enemy")).toBe(true);
  });
});
