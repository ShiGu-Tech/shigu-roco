import { describe, expect, it } from "vitest";

import type { Catalog } from "../../battle/types";
import { recommendBuild, recommendNature, recommendTalent } from "../recommend";

function makeCatalog(
  race: Record<string, number>,
  natures: { id: string; up: string | null; down: string | null }[],
  extra: Partial<Catalog["stats"]> = {},
): Catalog {
  return {
    dataVersion: "test",
    dataUpdatedAt: "",
    elements: [],
    sprites: [{ id: "sp-1", no: 1, name: "x", stage: 1, elements: [], race, trait: {}, leaderAllowed: true, skills: [] }],
    allSkills: [],
    marks: [],
    weather: [],
    rules: {},
    stats: { individual: { investCount: 3 }, natures, ...extra },
    warnings: [],
  } as unknown as Catalog;
}

const FAST_ATTACKER = { hp: 110, atk: 120, spatk: 70, defense: 80, spdef: 75, speed: 120 };

describe("recommendTalent", () => {
  it("性格加速度：优先速度，并补生命 / 攻击", () => {
    const catalog = makeCatalog(FAST_ATTACKER, [{ id: "n", up: "speed", down: "spdef" }]);
    const rec = recommendTalent(catalog, { spriteId: "sp-1", stars: 5, nature: "n" });
    expect(rec.order).toHaveLength(3);
    expect(rec.order[0]).toBe("speed");
    expect(rec.order).toContain("hp");
    expect(rec.order).toContain("atk");
    expect(rec.talent).toEqual({ speed: 10, hp: 10, atk: 10 });
  });

  it("性格加生命：优先生命并补物防 / 魔防", () => {
    const catalog = makeCatalog(FAST_ATTACKER, [{ id: "n", up: "hp", down: "spatk" }]);
    const rec = recommendTalent(catalog, { spriteId: "sp-1", stars: 5, nature: "n" });
    expect(rec.order).toEqual(["hp", "defense", "spdef"]);
  });

  it("性格削弱项一律排除", () => {
    const catalog = makeCatalog(FAST_ATTACKER, [{ id: "n", up: null, down: "atk" }]);
    const rec = recommendTalent(catalog, { spriteId: "sp-1", stars: 5, nature: "n" });
    expect(rec.order).not.toContain("atk");
    expect(rec.scores.atk).toBeLessThan(0);
  });

  it("中性性格按阈值规则（速度 / 生命 / 高攻）", () => {
    const catalog = makeCatalog(FAST_ATTACKER, [{ id: "neutral", up: null, down: null }]);
    const rec = recommendTalent(catalog, { spriteId: "sp-1", stars: 5, nature: "neutral" });
    expect(rec.order).toEqual(["speed", "hp", "atk"]);
  });

  it("阈值可被 stats.talentRecommend 覆盖", () => {
    const catalog = makeCatalog(
      FAST_ATTACKER,
      [{ id: "neutral", up: null, down: null }],
      { talentRecommend: { speedThreshold: 200, hpThreshold: 200, attackThreshold: 200 } },
    );
    const rec = recommendTalent(catalog, { spriteId: "sp-1", stars: 5, nature: "neutral" });
    // 阈值全部不命中 → 兜底取种族值前三：速度 120 / 物攻 120 / 生命 110
    expect(rec.order).toEqual(["speed", "atk", "hp"]);
  });

  it("模板缺失时仍返回合法三元组", () => {
    const catalog = makeCatalog(FAST_ATTACKER, [{ id: "neutral", up: null, down: null }]);
    const rec = recommendTalent(catalog, { spriteId: "sp-gone", stars: 5, nature: "neutral" });
    expect(rec.order).toHaveLength(3);
    expect(Object.keys(rec.talent)).toHaveLength(3);
  });
});

const NATURES = [
  { id: "neutral", up: null, down: null },
  { id: "fast", up: "speed", down: "spatk" },
  { id: "phys", up: "atk", down: "spatk" },
  { id: "bulk", up: "hp", down: "spatk" },
];

describe("recommendNature / recommendBuild", () => {
  it("速攻种族 → +速度，降较弱攻击", () => {
    const catalog = makeCatalog(FAST_ATTACKER, NATURES);
    expect(recommendNature(catalog, "sp-1")).toEqual({ id: "fast", up: "speed", down: "spatk" });
  });

  it("慢速强攻 → +较高攻击", () => {
    const catalog = makeCatalog({ ...FAST_ATTACKER, speed: 60 }, NATURES);
    expect(recommendNature(catalog, "sp-1")).toEqual({ id: "phys", up: "atk", down: "spatk" });
  });

  it("耐久种族 → +生命", () => {
    const catalog = makeCatalog({ hp: 130, atk: 70, spatk: 60, defense: 110, spdef: 105, speed: 50 }, NATURES);
    expect(recommendNature(catalog, "sp-1")).toEqual({ id: "bulk", up: "hp", down: "spatk" });
  });

  it("中性性格 → 自动选性格并给加点", () => {
    const catalog = makeCatalog(FAST_ATTACKER, NATURES);
    const rec = recommendBuild(catalog, { spriteId: "sp-1", stars: 5, nature: "neutral" });
    expect(rec.natureAuto).toBe(true);
    expect(rec.nature).toBe("fast");
    expect(rec.order[0]).toBe("speed");
  });

  it("已有明确性格 → 沿用、不覆盖", () => {
    const catalog = makeCatalog(FAST_ATTACKER, NATURES);
    const rec = recommendBuild(catalog, { spriteId: "sp-1", stars: 5, nature: "phys" });
    expect(rec.natureAuto).toBe(false);
    expect(rec.nature).toBe("phys");
    expect(rec.order).toContain("atk");
  });
});
