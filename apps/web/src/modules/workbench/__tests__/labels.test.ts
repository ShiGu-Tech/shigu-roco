import { describe, expect, it } from "vitest";

import { EDGE_PORT_LABELS, KIND_LABELS, OWNER_TYPE_LABELS, labelParamValue, labelValue, localizeNodeTitle } from "../labels";

describe("工作台汉化字典", () => {
  it("已登记枚举值汉化，未登记原样返回", () => {
    expect(labelValue("self")).toBe("自身");
    expect(labelValue("Physical")).toBe("物理");
    expect(labelValue("Fire")).toBe("火");
    expect(labelValue("currentHp")).toBe("当前HP");
    // 未登记：id / 自由字符串 / 中文 不改写
    expect(labelValue("sk-7020370")).toBe("sk-7020370");
    expect(labelValue("starfall-mark")).toBe("starfall-mark");
    expect(labelValue("灼烧")).toBe("灼烧");
    expect(labelValue("")).toBe("");
  });

  it("stat / scope 按参数键特判（defense 两义分流）", () => {
    expect(labelParamValue("stat", "defense")).toBe("物防");
    expect(labelParamValue("stat", "spatk")).toBe("魔攻");
    expect(labelParamValue("scope", "defense")).toBe("防御技能");
    expect(labelParamValue("scope", "attack")).toBe("攻击技能");
    // 非特判键回退裸值表
    expect(labelParamValue("target", "self")).toBe("自身");
    expect(labelParamValue("power", "sk-x")).toBe("sk-x");
  });

  it("节点标题只翻译已知算子，未知后缀原样", () => {
    expect(localizeNodeTitle("比较 · eq")).toBe("比较 · 等于");
    expect(localizeNodeTitle("比较 · gte")).toBe("比较 · 大于等于");
    expect(localizeNodeTitle("运算 · mul")).toBe("运算 · 乘");
    expect(localizeNodeTitle("取整 · floor")).toBe("取整");
    // 原样路径
    expect(localizeNodeTitle("分支")).toBe("分支");
    expect(localizeNodeTitle("cmp.eq")).toBe("cmp.eq");
  });

  it("角色 / 归属 / 端口字典键齐全", () => {
    for (const kind of ["trigger", "condition", "combinator", "effect"]) expect(KIND_LABELS[kind]).toBeTruthy();
    for (const owner of ["skill", "trait", "status", "mark", "weather", "system"]) expect(OWNER_TYPE_LABELS[owner]).toBeTruthy();
    expect(EDGE_PORT_LABELS.value).toBe("值");
    expect(EDGE_PORT_LABELS.cond).toBe("条件");
  });
});
