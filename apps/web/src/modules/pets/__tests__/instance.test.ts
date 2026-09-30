import { describe, expect, it } from "vitest";

import type { Catalog, CatalogSkill } from "../../battle/types";
import { emptyInstance, profileFromInstance, resolveInstance, type PetInstance } from "../instance";

function skill(id: string): CatalogSkill {
  return { id, name: id, element: "Fire", category: "Magic", actionType: "Attack", power: 50, cost: 2, priority: 0 };
}

const CATALOG = {
  dataVersion: "test",
  dataUpdatedAt: "",
  elements: [],
  sprites: [
    {
      id: "sp-1",
      no: 1,
      name: "测试精灵",
      stage: 1,
      elements: ["Fire"],
      race: { hp: 100, atk: 80, defense: 70, spatk: 90, spdef: 60, speed: 110 },
      trait: { name: "", desc: "" },
      leaderAllowed: true,
      skills: [skill("sk-a"), skill("sk-b")],
    },
  ],
  allSkills: [skill("sk-a"), skill("sk-b"), skill("sk-c")],
  marks: [],
  weather: [],
  rules: {},
  stats: { individual: { investCount: 3 } },
  warnings: [],
} as unknown as Catalog;

function makeInstance(patch: Partial<PetInstance> = {}): PetInstance {
  return { ...emptyInstance("sp-1"), id: "p1", ...patch };
}

describe("profileFromInstance", () => {
  it("个体值 = 天分 ×(1 + 星级)", () => {
    const profile = profileFromInstance({ level: 60, stars: 5, nature: "atk_spd", talent: { atk: 5, speed: 10 } });
    expect(profile.iv).toEqual({ atk: 30, speed: 60 });
    expect(profile.level).toBe(60);
    expect(profile.stars).toBe(5);
    expect(profile.nature).toBe("atk_spd");
  });

  it("0 星时个体值 = 天分本身", () => {
    expect(profileFromInstance({ level: 45, stars: 0, nature: null, talent: { hp: 3 } }).iv).toEqual({ hp: 3 });
  });
});

describe("resolveInstance", () => {
  it("合法技能全部保留并现算档案", () => {
    const resolved = resolveInstance(CATALOG, makeInstance({ skills: ["sk-a", "sk-b"] }));
    expect(resolved.sprite?.id).toBe("sp-1");
    expect(resolved.loadout).toEqual(["sk-a", "sk-b"]);
    expect(resolved.issues).toEqual([]);
  });

  it("空技能 = 用模板默认 4 招（loadout 为空）", () => {
    expect(resolveInstance(CATALOG, makeInstance()).loadout).toEqual([]);
  });

  it("技能不在该模板技能池 → skill-not-learnable 并过滤", () => {
    const resolved = resolveInstance(CATALOG, makeInstance({ skills: ["sk-a", "sk-c"] }));
    expect(resolved.loadout).toEqual(["sk-a"]);
    expect(resolved.issues).toContainEqual({ kind: "skill-not-learnable", skillId: "sk-c" });
  });

  it("技能全库不存在 → unknown-skill 并过滤", () => {
    const resolved = resolveInstance(CATALOG, makeInstance({ skills: ["sk-zzz"] }));
    expect(resolved.loadout).toEqual([]);
    expect(resolved.issues).toContainEqual({ kind: "unknown-skill", skillId: "sk-zzz" });
  });

  it("模板缺失 → orphan-sprite，实例保留", () => {
    const resolved = resolveInstance(CATALOG, makeInstance({ spriteId: "sp-gone" }));
    expect(resolved.sprite).toBeNull();
    expect(resolved.issues).toContainEqual({ kind: "orphan-sprite", spriteId: "sp-gone" });
  });

  it("加点超过 investCount / 出战超过 4 → 记录计数问题", () => {
    const resolved = resolveInstance(
      CATALOG,
      makeInstance({ talent: { hp: 1, atk: 1, defense: 1, speed: 1 }, skills: ["sk-a", "sk-b", "sk-c", "sk-a", "sk-b"] }),
    );
    expect(resolved.issues).toContainEqual({ kind: "too-many-talents", count: 4, max: 3 });
    expect(resolved.issues).toContainEqual({ kind: "too-many-skills", count: 5 });
  });
});
