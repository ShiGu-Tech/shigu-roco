import { describe, expect, it } from "vitest";
import { balanceRange, damageOf, defenseRange, formatPanel, ivFromTalent, panelOf, perLevelGain, statOf } from "../calc";

const MILIYA = { hp: 118, atk: 82, spatk: 89, defense: 103, spdef: 147, speed: 105 };
const MIGUOHAI = { hp: 102, atk: 43, spatk: 110, defense: 68, spdef: 85, speed: 88 };

describe("panel calculator", () => {
  it("里拉鳐 L45 0★ +魔攻-魔防 魔防+10 → 220/88/105/108/139/110", () => {
    const panel = panelOf(MILIYA, { level: 45, natureUp: "spatk", natureDown: "spdef", iv: { spdef: 10 } });
    expect(formatPanel(panel)).toBe("220 / 88 / 105 / 108 / 139 / 110");
  });

  it("蜜果骸 L41 +生命-速度 生命+10/物防+8/速度+10 → 211/49/110/76/87/86", () => {
    const panel = panelOf(MIGUOHAI, {
      level: 41,
      natureUp: "hp",
      natureDown: "speed",
      iv: { hp: 10, defense: 8, speed: 10 },
    });
    expect(formatPanel(panel)).toBe("211 / 49 / 110 / 76 / 87 / 86");
  });

  it("单项面板", () => {
    expect(statOf(MILIYA, "spdef", { level: 45, natureUp: "spatk", natureDown: "spdef", iv: { spdef: 10 } })).toBe(139);
  });

  it("个体值 = 天分 × (1 + 星级)，上限 60", () => {
    expect(ivFromTalent(10, 0)).toBe(10);
    expect(ivFromTalent(10, 5)).toBe(60);
    expect(ivFromTalent(5, 2)).toBe(15);
    expect(ivFromTalent(10, 9)).toBe(60);
  });

  it("每级提升（不含性格）", () => {
    expect(perLevelGain(MILIYA, "spdef", 10)).toBeCloseTo((147 + 5) / 100, 10);
    expect(perLevelGain(MILIYA, "hp")).toBeCloseTo(1 + (2 * 118) / 100, 10);
  });

  it("带标签输出", () => {
    const panel = panelOf(MIGUOHAI, { level: 41, natureUp: "hp", natureDown: "speed", iv: { hp: 10, defense: 8, speed: 10 } });
    expect(formatPanel(panel, { labels: true })).toContain("魔攻 110");
  });
});

describe("实测校准（2026-09-29 · 官方公式 + 5★/0★ 逐格对拍）", () => {
  it("音速犬 L60 5★ +速度-魔攻 三维满 → 366/221/97/171/150/260", () => {
    const panel = panelOf(
      { hp: 85, atk: 116, spatk: 38, defense: 101, spdef: 82, speed: 120 },
      { level: 60, stars: 5, natureUp: "speed", natureDown: "spatk", iv: { hp: 60, atk: 60, speed: 60 } },
    );
    expect(formatPanel(panel)).toBe("366 / 221 / 97 / 171 / 150 / 260");
  });

  it("银月狼王 L60 5★ +速度-物防 三维满 → 417/234/116/186/168/273", () => {
    const panel = panelOf(
      { hp: 115, atk: 128, spatk: 51, defense: 128, spdef: 98, speed: 130 },
      { level: 60, stars: 5, natureUp: "speed", natureDown: "defense", iv: { hp: 60, atk: 60, speed: 60 } },
    );
    expect(formatPanel(panel)).toBe("417 / 234 / 116 / 186 / 168 / 273");
  });

  it("冰钻布鲁斯 L60 5★ 调皮(+物攻-魔防) 三维满 → 345/235/90/185/146/192", () => {
    const panel = panelOf(
      { hp: 73, atk: 101, spatk: 27, defense: 114, spdef: 88, speed: 90 },
      { level: 60, stars: 5, natureUp: "atk", natureDown: "spdef", iv: { hp: 60, atk: 60, speed: 60 } },
    );
    expect(formatPanel(panel)).toBe("345 / 235 / 90 / 185 / 146 / 192");
  });

  it("小星光 L45 0★ +魔攻-生命 → 125/91/105/78/98/113", () => {
    const panel = panelOf(
      { hp: 60, atk: 81, spatk: 85, defense: 72, spdef: 88, speed: 108 },
      { level: 45, stars: 0, natureUp: "spatk", natureDown: "hp", iv: { atk: 9, spatk: 9, spdef: 9 } },
    );
    expect(formatPanel(panel)).toBe("125 / 91 / 105 / 78 / 98 / 113");
  });
});

describe("damage calculator", () => {
  it("汲取 30 威力（草×2 · 本系 1.25 → 有效 75）打魔防 139", () => {
    const result = damageOf({ atk: 110, power: 30, typeMult: 2, stab: 1.25, defense: 139 });
    expect(result.effectivePower).toBe(75);
    expect(result.damage).toBe(53);
  });

  it("反推系数：两招样本交集落在 0.472~0.480", () => {
    const [lo, hi] = balanceRange([
      { damage: 28, atk: 110, effectivePower: 75, defense: 139 },
      { damage: 37, atk: 110, effectivePower: 100, defense: 139 },
    ]);
    expect(lo).toBeGreaterThan(0.471);
    expect(hi).toBeLessThan(0.481);
  });

  it("反推防御：两招样本交集落在 261~266", () => {
    const [lo, hi] = defenseRange(
      [
        { damage: 28, atk: 110, effectivePower: 75 },
        { damage: 37, atk: 110, effectivePower: 100 },
      ],
      37 / 41,
    );
    expect(lo).toBeGreaterThan(261);
    expect(lo).toBeLessThan(262);
    expect(hi).toBeGreaterThan(265);
    expect(hi).toBeLessThan(266);
  });
});
