import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../catalog/normalize";
import type { ExternalSnapshot } from "../catalog/types";

const snapshot: ExternalSnapshot = {
  meta: {
    catalogVersion: "test-v1",
    generatedAt: "2026-09-28T00:00:00.000Z",
    origin: "https://roco.world",
    types: [
      { id: 2, name: "普通系", short: "普通" },
      { id: 3, name: "草系", short: "草" },
    ],
  },
  spirits: [{ id: 1, formId: 1, name: "测试精灵", types: [3], stage: 1, stats: { hp: 100, patk: 80, satk: 70, pdef: 60, sdef: 50, spd: 40 }, passive: { name: "测试特性", descPlain: "测试文本" } }],
  skills: [{ id: 10, name: "测试攻击", cat: "物理", type: "草系", typeId: 3, energy: 1, dmgMin: 50, dmgMax: 50, cdMin: 0, cdMax: 0, descPlain: "造成伤害" }],
  spiritSkills: { "1:1": [{ id: 10, src: "level", lv: 1 }, { id: 900, src: "passive", lv: null }] },
  matchups: [[3, 2, 1]],
  glossary: [
    { id: 1001, name: "中毒", descPlain: "回合结束造成伤害。" },
    { id: 3006, name: "沙暴", descPlain: "地系技能能耗减半。" },
  ],
};

describe("catalog normalization", () => {
  it("normalizes stable ids, ignores passive skill links, and preserves matchups", () => {
    const catalog = normalizeSnapshot(snapshot, "test-v1-20260928000000", "2026-09-28T00:01:00.000Z");
    expect(catalog.sprites[0].id).toBe("sp-1-1");
    expect(catalog.sprites[0].skillList).toEqual(["sk-10"]);
    expect(catalog.skills[0]).toMatchObject({ id: "sk-10", category: "Physical", element: "Grass", power: 50 });
    expect((catalog.elements.matrix as Record<string, Record<string, string>>).Grass.Normal).toBe("counter");
    expect(catalog.statuses[0]).toMatchObject({ id: "poison", name: "中毒", description: "回合结束造成伤害。" });
    expect(catalog.marks).toEqual([]);
    expect(catalog.weather[0]).toMatchObject({ id: "sandstorm", name: "沙暴", description: "地系技能能耗减半。" });
    expect(catalog.warnings).toEqual([]);
  });
});
