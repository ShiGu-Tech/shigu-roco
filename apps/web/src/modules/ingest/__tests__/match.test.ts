import { describe, expect, it } from "vitest";

import { matchNames, matchSegment, matchSides, normalizeName } from "../match";

const ENTRIES = [
  { id: "sp-1-1", name: "迪莫" },
  { id: "sp-2-1", name: "音速犬" },
  { id: "sp-3-1", name: "冰钻布鲁斯" },
  { id: "sp-4-1", name: "锥尾羊" },
  { id: "sp-5-1", name: "圣光迪莫" },
];

describe("名单匹配器", () => {
  it("归一化去掉标点、空白与噪词", () => {
    expect(normalizeName(" 迪莫 ")).toBe("迪莫");
    expect(normalizeName("音速犬，")).toBe("音速犬");
    expect(normalizeName("一只 冰钻布鲁斯")).toBe("冰钻布鲁斯");
  });

  it("完全相等给最高置信度", () => {
    const [best] = matchSegment("迪莫", ENTRIES);
    expect(best.id).toBe("sp-1-1");
    expect(best.confidence).toBe(1);
  });

  it("长名字优先于其子串（圣光迪莫 vs 迪莫）", () => {
    const hits = matchSegment("圣光迪莫", ENTRIES);
    expect(hits[0].id).toBe("sp-5-1");
  });

  it("编辑距离容忍一个错字", () => {
    const [best] = matchSegment("音速大", ENTRIES);
    expect(best?.id).toBe("sp-2-1");
  });

  it("切分口语名单并逐段匹配", () => {
    const result = matchNames("我方 迪莫、音速犬 和 冰钻布鲁斯，对面锥尾羊", ENTRIES);
    const ids = result.segments.map((s) => s.candidates[0]?.id);
    expect(ids).toEqual(["sp-1-1", "sp-2-1", "sp-3-1", "sp-4-1"]);
    expect(result.unmatched).toEqual([]);
  });

  it("未命中的片段单独回报", () => {
    const result = matchNames("迪莫 完全不存在的精灵", ENTRIES);
    expect(result.segments).toHaveLength(1);
    expect(result.unmatched).toEqual(["完全不存在的精灵"]);
  });
});

describe("分侧解析", () => {
  it("按标记切成两组", () => {
    const result = matchSides("我方 迪莫、音速犬 对方 冰钻布鲁斯、锥尾羊", ENTRIES);
    expect(result.player.map((s) => s.candidates[0]?.id)).toEqual(["sp-1-1", "sp-2-1"]);
    expect(result.enemy.map((s) => s.candidates[0]?.id)).toEqual(["sp-3-1", "sp-4-1"]);
  });

  it("识别「红方 / 蓝方 / 对面」等同义标记", () => {
    const result = matchSides("红方：迪莫 蓝方：锥尾羊", ENTRIES);
    expect(result.player).toHaveLength(1);
    expect(result.enemy).toHaveLength(1);
  });

  it("没有标记时全部归 unknown（不猜侧别）", () => {
    const result = matchSides("迪莫、音速犬", ENTRIES);
    expect(result.unknown).toHaveLength(2);
    expect(result.player).toHaveLength(0);
    expect(result.enemy).toHaveLength(0);
  });
});

describe("真实口语写法（用户实录）", () => {
  const ENTRIES2 = [
    { id: "wang", name: "圣羽翼王" },
    { id: "gu", name: "寂灭骨龙" },
    { id: "lan", name: "岚鸟" },
    { id: "hu", name: "尖嘴狐仙" },
    { id: "qi", name: "奇丽花" },
    { id: "long", name: "龙息帕尔" },
    { id: "bai", name: "白金独角兽" },
    { id: "bei", name: "贝古斯" },
    { id: "yuan", name: "圆号鱼" },
  ];

  it("剔除编号与颜色/形态修饰词", () => {
    const r = matchNames("敌方：1. 白金独角兽 2. 贝古斯蓝鸟 3. 绿色形态圣羽翼王", ENTRIES2);
    const names = r.segments.map((s) => s.candidates[0]?.name);
    expect(names).toContain("白金独角兽");
    expect(names).toContain("贝古斯");
    expect(names).toContain("圣羽翼王");
    expect(r.unmatched).not.toContain('白金独角兽');
  });

  it("连写的两只切得开（圆号鱼骨龙 = 圆号鱼 + 寂灭骨龙）", () => {
    const r = matchNames("4. 圆号鱼骨龙", ENTRIES2);
    const names = r.segments.map((s) => s.candidates[0]?.name);
    expect(names).toEqual(["圆号鱼", "寂灭骨龙"]);
  });

  it("简称靠后缀兜底（翼王骨龙 / 骨龙）", () => {
    const r = matchNames("我方剩余翼王骨龙", ENTRIES2);
    const names = r.segments.map((s) => s.candidates[0]?.name);
    expect(names).toContain("寂灭骨龙");
    expect(names).toContain("圣羽翼王");
  });

  it("同一只不重复计数（尖嘴 + 狐仙）", () => {
    const r = matchNames("尖嘴、狐仙", ENTRIES2);
    expect(r.segments.filter((s) => s.candidates[0]?.name === "尖嘴狐仙")).toHaveLength(1);
  });
});

describe("形态与高阶优先", () => {
  const FORMS = [
    { id: "lan1", name: "岚鸟", form: "本来的样子", formId: 1, stage: 3 },
    { id: "lan2", name: "岚鸟", form: "春天的样子", formId: 2, stage: 3 },
    { id: "lan3", name: "岚鸟", form: "夏天的样子", formId: 3, stage: 3 },
    { id: "gu2", name: "大头骨龙", form: null, formId: 1, stage: 2 },
    { id: "gu3", name: "寂灭骨龙", form: null, formId: 1, stage: 3 },
  ];

  it("同名多形态：默认给「本来的样子」，并把各形态都作为候选", () => {
    const [seg] = matchNames("岚鸟", FORMS).segments;
    expect(seg.candidates[0]).toMatchObject({ id: "lan1", form: "本来的样子" });
    expect(seg.candidates.map((c) => c.form)).toEqual(["本来的样子", "春天的样子", "夏天的样子"]);
  });

  it("写了形态提示就选那个形态（岚鸟 春天的样子）", () => {
    const [seg] = matchNames("岚鸟春天形态", FORMS).segments;
    expect(seg.candidates[0]).toMatchObject({ id: "lan2", form: "春天的样子" });
  });

  it("简称歧义时高阶优先（骨龙 → 寂灭骨龙 stage3）", () => {
    const [seg] = matchNames("骨龙", FORMS).segments;
    expect(seg.candidates[0].id).toBe("gu3");
    expect(seg.candidates.map((c) => c.name)).toContain("大头骨龙");
  });
});
