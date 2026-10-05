import { describe, expect, it } from "vitest";

import { fieldBadge, markNature, newIntel, recordMagic, recordSeenSkill } from "../intel";

describe("对手情报档案", () => {
  it("初始全未知", () => {
    const i = newIntel("sp-1");
    expect(i.skills).toEqual([]);
    expect(i.nature.level).toBe("unknown");
    expect(i.talent.level).toBe("unknown");
    expect(fieldBadge(i.nature.level)).toBe("未知");
  });

  it("已见技能去重、按首次使用顺序", () => {
    let i = newIntel("sp-1");
    i = recordSeenSkill(i, "sk-a", 1);
    i = recordSeenSkill(i, "sk-b", 2);
    i = recordSeenSkill(i, "sk-a", 3);
    expect(i.skills.map((s) => s.id)).toEqual(["sk-a", "sk-b"]);
    expect(i.skills[0].turn).toBe(1);
  });

  it("记录魔法与人工确认性格", () => {
    let i = newIntel("sp-1");
    i = recordMagic(i, "grass");
    i = markNature(i, "adamant");
    expect(i.magic.grass).toBe(true);
    expect(i.magic.wish).toBe(false);
    expect(i.nature).toEqual({ value: "adamant", level: "known" });
    expect(fieldBadge(i.nature.level)).toBe("已确认");
  });
});
