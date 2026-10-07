import { describe, expect, it } from "vitest";

import { damageOf } from "@/modules/engine/calc";
import { computeStats } from "@/modules/engine/stats";
import { profileFromSetup, type PetSetup } from "@/modules/battle/pet";
import type { ActiveSpriteState, Catalog, CatalogSkill, CatalogSprite } from "@/modules/battle/types";

import { inferOpponent } from "../infer";

const RACE = { hp: 100, atk: 100, spatk: 100, defense: 100, spdef: 100, speed: 100 };

function sprite(id: string, elements: string[]): CatalogSprite {
  return {
    id,
    no: 1,
    name: id,
    stage: 1,
    elements,
    race: { ...RACE },
    trait: {},
    leaderAllowed: true,
    skills: [],
  };
}

const SKILL: CatalogSkill = {
  id: "sk-test",
  name: "测试击",
  element: "Fire",
  category: "Physical",
  actionType: "Attack",
  power: 60,
  cost: 1,
  priority: 0,
};

function catalog(selfSprite: CatalogSprite, oppSprite: CatalogSprite): Catalog {
  return {
    dataVersion: "test",
    dataUpdatedAt: "",
    elements: [],
    elementMatrix: {},
    elementValues: { counter: 2, counter3: 3, resisted: 0.5, resisted4: 0.25 },
    elementCombine: {},
    sprites: [selfSprite, oppSprite],
    allSkills: [SKILL],
    statuses: [],
    marks: [],
    weather: [],
    rules: {},
    stats: {},
    warnings: [],
  };
}

function active(spriteId: string, profile: ActiveSpriteState["profile"]): ActiveSpriteState {
  return {
    spriteId,
    hp: 999,
    maxHp: 999,
    energy: 10,
    loadout: [SKILL.id],
    buffs: {},
    debuffs: {},
    marks: {},
    statuses: {},
    profile,
  };
}

describe("精灵试验台 · 资质反推", () => {
  const selfSprite = sprite("sp-self", ["Normal"]);
  const oppSprite = sprite("sp-opp", ["Water"]);
  const cat = catalog(selfSprite, oppSprite);

  // 我方攻击面板（0★、无加点）
  const selfProfile = profileFromSetup({ level: 60, stars: 0, nature: null, talent: {}, skills: [] });
  const selfAtk = computeStats(cat.stats ?? {}, { race: selfSprite.race }, selfProfile).atk;

  // 对方真实养成：5★ · 60 · 中性 · 三维（推荐加点）物防 +10 / 生命 +10
  const trueSetup: PetSetup = { level: 60, stars: 5, nature: null, talent: { defense: 10, hp: 10 }, skills: [] };
  const truePanel = computeStats(cat.stats ?? {}, { race: oppSprite.race }, profileFromSetup(trueSetup));

  it("由伤害 + 本次掉血% 反推出防御区间与最大 HP 区间，且包含真值", () => {
    const damage = damageOf({ atk: selfAtk, power: SKILL.power, defense: truePanel.defense, typeMult: 1, stab: 1 }).damage;
    const dropPct = (100 * damage) / truePanel.hp;
    const result = inferOpponent({
      catalog: cat,
      oppSprite,
      oppActive: active(oppSprite.id, profileFromSetup(trueSetup)),
      selfSprite,
      selfActive: active(selfSprite.id, selfProfile),
      observations: [{ id: "o1", turn: 1, kind: "damage", attackerSkillId: SKILL.id, damage, dropPct }],
    });

    expect(result.conflict).toBe(false);
    expect(result.sampleCount).toBe(1);
    expect(result.defense).toBeDefined();
    expect(result.defense![0]).toBeLessThanOrEqual(truePanel.defense);
    expect(result.defense![1]).toBeGreaterThanOrEqual(truePanel.defense);
    expect(result.maxHp).toBeDefined();
    expect(result.maxHp![0]).toBeLessThanOrEqual(truePanel.hp);
    expect(result.maxHp![1]).toBeGreaterThanOrEqual(truePanel.hp);
    expect(result.nature.length).toBeGreaterThan(0);
    expect(result.recommended).toBe(true);
    expect(result.talent.some((t) => t.talent.defense === 10 && t.talent.hp === 10)).toBe(true);
  });

  it("同一伤害连续命中（掉血%恒定）不产生矛盾——修复「剩余%」误用", () => {
    const damage = damageOf({ atk: selfAtk, power: SKILL.power, defense: truePanel.defense, typeMult: 1, stab: 1 }).damage;
    const dropPct = (100 * damage) / truePanel.hp;
    const result = inferOpponent({
      catalog: cat,
      oppSprite,
      oppActive: active(oppSprite.id, profileFromSetup(trueSetup)),
      selfSprite,
      selfActive: active(selfSprite.id, selfProfile),
      observations: [
        { id: "o1", turn: 1, kind: "damage", attackerSkillId: SKILL.id, damage, dropPct },
        { id: "o2", turn: 2, kind: "damage", attackerSkillId: SKILL.id, damage, dropPct },
      ],
    });
    expect(result.conflict).toBe(false);
    expect(result.maxHp).toBeDefined();
    expect(result.maxHp![0]).toBeLessThanOrEqual(truePanel.hp);
    expect(result.maxHp![1]).toBeGreaterThanOrEqual(truePanel.hp);
  });

  it("带引擎校正（受击方减伤 80%）时，目标防御回到真值并给出最吻合组合", () => {
    const strong: CatalogSkill = { ...SKILL, id: "sk-strong", power: 200 };
    const cat2: Catalog = { ...cat, allSkills: [strong] };
    // 引擎按当前（中性）配置结算，且已计入受击方 80% 减伤 → engineDamage 是减伤后伤害。
    const baselineProfile = profileFromSetup({ level: 60, stars: 5, nature: null, talent: {}, skills: [] });
    const baselineDef = computeStats(cat2.stats ?? {}, { race: oppSprite.race }, baselineProfile).defense;
    const engineDamage = Math.floor(damageOf({ atk: selfAtk, power: strong.power, defense: baselineDef, typeMult: 1, stab: 1 }).damage * 0.2);
    const observed = Math.floor(damageOf({ atk: selfAtk, power: strong.power, defense: truePanel.defense, typeMult: 1, stab: 1 }).damage * 0.2);
    const result = inferOpponent({
      catalog: cat2,
      oppSprite,
      oppActive: active(oppSprite.id, baselineProfile),
      selfSprite,
      selfActive: active(selfSprite.id, selfProfile),
      observations: [{ id: "o1", turn: 1, kind: "damage", attackerSkillId: strong.id, damage: observed, engineDamage }],
    });
    expect(result.conflict).toBe(false);
    expect(result.defense).toBeDefined();
    expect(result.defense![0]).toBeLessThanOrEqual(truePanel.defense);
    expect(result.defense![1]).toBeGreaterThanOrEqual(truePanel.defense);
    expect(result.best && result.best.length).toBeGreaterThan(0);
  });

  it("无观测时返回空结果", () => {
    const result = inferOpponent({
      catalog: cat,
      oppSprite,
      oppActive: active(oppSprite.id, undefined),
      selfSprite,
      selfActive: active(selfSprite.id, selfProfile),
      observations: [],
    });
    expect(result.sampleCount).toBe(0);
    expect(result.nature).toHaveLength(0);
  });
});
