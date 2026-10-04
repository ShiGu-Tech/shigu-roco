import { describe, expect, it } from "vitest";

import type { BattleEvent, Catalog } from "@/modules/battle/types";

import { describeEvent, logRowOf, mechanismHitOf } from "../log";

const cat = {} as Catalog;

function ev(type: string, data: Record<string, unknown> = {}, side = "player"): BattleEvent {
  return { type, side, text: "", data };
}

const catalog = {
  allSkills: [{ id: "sk-7070010", name: "械斗", nameZh: "械斗", actionType: "Attack", actionTypeZh: "攻击", element: "Normal", category: "Physical", categoryZh: "物理", power: 100, cost: 1, priority: 0 }],
  sprites: [{ id: "sp-202-1", no: 202, name: "鳗尾兽", nameZh: "鳗尾兽", stage: 1, elements: [], race: {}, trait: { name: "铃兰晚钟" } }],
  statuses: [],
  marks: [],
  weather: [],
  elements: [],
  rules: {},
  warnings: [],
} as unknown as Catalog;

describe("board log", () => {
  it("纯机制事件翻中文（不残留英文 id / 效果名）", () => {
    const event = ev("loadout-rotated", { trigger: "turnStart", mechanismId: "skill:sk-1:transmission", effectType: "rotateLoadout" });
    const text = describeEvent(event, cat);
    expect(text).toContain("回合开始");
    expect(text).toContain("技能栏轮转");
    expect(text).not.toContain("loadout-rotated");
    expect(text).not.toContain("skill:sk-1");
  });

  it("mechanismHitOf：纯机制命中，叙事 / 原生事件不命中", () => {
    const mech = ev("loadout-rotated", { trigger: "turnStart", mechanismId: "skill:sk-1:transmission", effectType: "rotateLoadout" });
    expect(mechanismHitOf(mech)).toEqual({ trigger: "turnStart", mechanismId: "skill:sk-1:transmission", effectType: "rotateLoadout" });

    const damage = ev("damage", { trigger: "beforeAction", mechanismId: "skill:sk-1", effectType: "dealDamage", value: 10 });
    expect(mechanismHitOf(damage)).toBeNull();

    const native = ev("some-native", {});
    expect(mechanismHitOf(native)).toBeNull();
  });

  it("logRowOf：技能伤害给「攻击·械斗」并去掉尾部来源名；特性伤害给「特性·鳗尾兽·铃兰晚钟」", () => {
    const skill = ev("damage", { skillId: "sk-7070010", value: 115 }, "enemy");
    const rowSkill = logRowOf(skill, catalog);
    expect(rowSkill.kind).toBe("攻击");
    expect(rowSkill.source).toBe("械斗");
    expect(rowSkill.text).toBe("蓝方受到 115 点伤害");

    const trait = ev("damage", { mechanismId: "trait:sp-202-1", trigger: "onEntry", effectType: "dealDamage", value: 418 }, "enemy");
    const rowTrait = logRowOf(trait, catalog);
    expect(rowTrait.kind).toBe("特性");
    expect(rowTrait.source).toBe("鳗尾兽·铃兰晚钟");
    expect(rowTrait.text).toBe("蓝方受到 418 点伤害");
  });
});
