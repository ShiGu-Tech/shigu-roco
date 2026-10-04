import { describe, expect, it } from "vitest";
import { compileMechanism } from "@/modules/engine/graph";
import type { MechanismDefinition } from "@/modules/engine/mechanisms/types";

import { toProgramGraph, type NodeCatalogItem } from "../program-graph";

/** 最小节点目录：类别驱动画布配色，标题兜底到 type。 */
const CATALOG: NodeCatalogItem[] = [
  { type: "on.beforeAction", title: "行动前", category: "event" },
  { type: "flow.branch", title: "分支", category: "flow" },
  { type: "flow.gate", title: "门", category: "flow" },
  { type: "read.path", title: "取值（路径）", category: "read" },
  { type: "read.literal", title: "常量", category: "read" },
  { type: "read.ref", title: "取值（动态引用）", category: "read" },
  { type: "cmp.eq", title: "比较 · eq", category: "cmp" },
  { type: "cmp.lt", title: "比较 · lt", category: "cmp" },
  { type: "logic.and", title: "逻辑与", category: "logic" },
  { type: "logic.not", title: "逻辑非", category: "logic" },
  { type: "write.modifyEnergy", title: "写入 · 能量", category: "write" },
  { type: "write.dealDamage", title: "写入 · 造成伤害", category: "write" },
  { type: "write.modifyStat", title: "写入 · 属性", category: "write" },
];

function def(): MechanismDefinition {
  return {
    id: "skill:sk-graph",
    ownerType: "skill",
    ownerId: "sk-graph",
    trigger: "beforeAction",
    oncePerTurn: true,
    when: [
      { path: "event.action.skillId", op: "eq", value: "sk-graph" },
      { not: { path: "event.reacted", op: "eq", value: true } },
    ],
    // 伤害在 DSL 先、状态在后——效果链按应用域分段会重排，验证 source 仍指 DSL 原序下标。
    effects: [
      { type: "dealDamage", target: "target", category: "Physical", power: 60, skillId: "sk-graph" },
      { type: "modifyEnergy", target: "self", delta: -3 },
      { type: "modifyStat", target: "self", stat: "atk", mode: "flat", value: 2 },
    ],
  };
}

describe("G3b 程序视图画（program-graph + sources）", () => {
  it("程序每个节点都有 DSL 源头，视图节点覆盖完整", () => {
    const compiled = compileMechanism(def());
    expect(Object.keys(compiled.sources).sort()).toEqual(compiled.program.nodes.map((n) => n.id).sort());

    const graph = toProgramGraph(compiled.program, compiled.sources, CATALOG);
    expect(graph.nodes).toHaveLength(compiled.program.nodes.length);
    expect(graph.edges).toHaveLength(compiled.program.edges.length);
    expect(graph.nodes.every((node) => node.source !== undefined)).toBe(true);
    expect(graph.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
  });

  it("角色映射：入口=trigger、写入=effect 且带 DSL 原序下标、门/分支=combinator", () => {
    const compiled = compileMechanism(def());
    const graph = toProgramGraph(compiled.program, compiled.sources, CATALOG);

    const entry = graph.nodes.find((node) => node.source?.role === "entry");
    expect(entry?.kind).toBe("trigger");
    expect(entry?.title).toBe("行动执行前");

    const gate = graph.nodes.find((node) => node.source?.role === "gate");
    expect(gate?.kind).toBe("combinator");

    const effects = graph.nodes.filter((node) => node.source?.role === "effect");
    expect(effects).toHaveLength(3);
    // 效果链按 域 分段重排（状态在前、伤害在后），副标题 = DSL 位置且 source 仍指 DSL 原序
    const byIndex = new Map(effects.map((node) => [node.source?.effect, node.subtitle]));
    expect(byIndex.get(0)).toBe("effects[0]");
    expect(byIndex.get(1)).toBe("effects[1]");
    expect(byIndex.get(2)).toBe("effects[2]");
    const types = effects.map((node) => node.subtitle);
    expect(types[0]).toBe("effects[1]"); // 链序：状态 → 伤害

    // 触发器节点不重复显示英文触发器名
    const entryNode = graph.nodes.find((node) => node.source?.role === "entry");
    expect(entryNode?.subtitle).toBeUndefined();

    // 条件叶子带 when 下标 + 字段
    const pathNode = graph.nodes.find((node) => node.source?.field === "path");
    expect(pathNode?.source).toMatchObject({ role: "condition", when: 0, leaf: [] });
    const cmpNode = graph.nodes.find((node) => node.source?.field === "op");
    expect(cmpNode?.source?.when).toBe(0);
  });

  it("目录缺失时：事件标题仍由词汇表推导，其余节点标题回退到类型", () => {
    const compiled = compileMechanism(def());
    const graph = toProgramGraph(compiled.program, compiled.sources, []);
    const entry = graph.nodes.find((node) => node.source?.role === "entry");
    expect(entry?.title).toBe("行动执行前"); // on.* 触发器标题走词汇表，不依赖节点目录
    const cmp = graph.nodes.find((node) => node.source?.field === "op");
    expect(cmp?.title).toBe("cmp.eq"); // 目录为空 → 回退 type
  });
});
