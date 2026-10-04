/** 执行图 → 视图图（工作台 G3b 画布：编辑对象＝真程序）。
 *
 * 与 `dsl-graph.ts`（DSL 展示投影，对照视图）不同，本模块渲染的是 `compileMechanism` 产出的
 * **真程序**：`on.*` 入口 → 条件子图（read / cmp / logic）→ `flow.branch` → `flow.gate` → `write.*` 链。
 * 每个视图节点带上 `source`（`NodeSource`）——点程序节点即可映射回 `when[i]` 的字段或 `effects[j]`，
 * 这是 G3b 编辑的定位依据；布局为最长路径分层（数据子图靠左、效果链向右），复用 dsl-graph 的展示格式。
 *
 * 纯函数、无 DOM 依赖，可单测。
 */

import type { NodeSource, Program } from "@/modules/engine/graph";
import type { GraphNode } from "@/modules/engine/graph/types";
import { EFFECT_DOMAIN_LABELS, effectVocabularyOf, triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";
import type { EffectDefinition } from "@/modules/engine/mechanisms/types";

import { EDGE_PORT_LABELS, PREFIX_LABELS, localizeNodeTitle } from "./labels";
import { COLUMN_X, ROW_Y, effectParams, valueText, type MechanismGraph, type ParamView, type ViewEdge, type ViewNode, type ViewNodeKind } from "./dsl-graph";

/** 节点类型目录项（由 `GET /api/engine/workbench/schema` 的 `nodes` 暴露，UI 不硬编码语义）。 */
export interface NodeCatalogItem {
  type: string;
  title: string;
  category: string;
}

const KIND_OF_CATEGORY: Record<string, ViewNodeKind> = {
  event: "trigger",
  write: "effect",
  flow: "combinator",
  read: "condition",
  math: "condition",
  logic: "condition",
  cmp: "condition",
  query: "condition",
  rng: "condition",
  resource: "combinator",
};

/** 非写入节点的参数展示标签（仅展示用，语义由节点 schema 决定）。 */
const PARAM_LABELS: Record<string, string> = {
  path: "取值路径",
  value: "值",
  ref: "动态取值",
  key: "键",
  withSide: "按阵营计次",
  negate: "取反",
  max: "上限",
  expr: "表达式",
  from: "阵营",
  priority: "优先级",
};

function nodeParams(node: GraphNode): ParamView[] {
  // 写入节点展示其 spec（效果原语字段，标签来自词汇表）；其余节点展示具名参数。
  const raw = (node.params ?? {}) as Record<string, unknown>;
  if (node.type.startsWith("write.") && raw.spec && typeof raw.spec === "object") {
    return effectParams(raw.spec as EffectDefinition, {});
  }
  return Object.entries(raw)
    .filter(([key]) => key !== "spec" && key !== "mechanismId" && key !== "ownerType" && key !== "ownerId" && key !== "effectIndex")
    .map(([key, value]) => ({
      key,
      label: PARAM_LABELS[key] ?? key,
      value,
      display: valueText(value, key),
      dynamic: false,
    }));
}

/** 最长路径分层：根（无入边）为第 0 列，每个节点取全部前驱的最深值 +1。 */
function layoutDepths(program: Program): Map<string, number> {
  const incoming = new Map<string, string[]>();
  const order: string[] = [];
  for (const node of program.nodes) {
    order.push(node.id);
    incoming.set(node.id, incoming.get(node.id) ?? []);
  }
  for (const edge of program.edges) {
    incoming.set(edge.to.node, [...(incoming.get(edge.to.node) ?? []), edge.from.node]);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const memo = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) throw new Error(`执行图存在环: ${id}`);
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length ? Math.max(...parents.map((parent) => memo(parent))) + 1 : 0;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };
  for (const id of order) memo(id);
  return depth;
}

/** 程序 → 视图图。`nodesCatalog` 提供节点类型标题（来自引擎注册表导出）。 */
export function toProgramGraph(
  program: Program,
  sources: Record<string, NodeSource>,
  nodesCatalog: NodeCatalogItem[],
): MechanismGraph {
  const byType = new Map(nodesCatalog.map((item) => [item.type, item]));
  const depths = layoutDepths(program);
  const rows = new Map<number, number>();

  const nodes: ViewNode[] = [];
  const payloads: Record<string, unknown> = {};

  // 按创建序遍历（条件子图先于 branch、效果链保 DSL 原序），保证同列行序稳定可读。
  for (const node of program.nodes) {
    const meta = byType.get(node.type);
    const kind = KIND_OF_CATEGORY[meta?.category ?? "read"] ?? "condition";
    const depth = depths.get(node.id) ?? 0;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    const raw = (node.params ?? {}) as Record<string, unknown>;
    // 标题：schema 目录（含英文算子汉化）；副标题：结构节点给中文分类词，写入节点给 DSL 位置（编辑定位依据），触发器不重复标题。
    let title = localizeNodeTitle(meta?.title ?? node.type);
    let subtitle: string | undefined = PREFIX_LABELS[node.type.split(".")[0]];
    let domain: ViewNode["domain"];
    if (node.type.startsWith("on.")) {
      const trigger = node.type.slice(3);
      subtitle = undefined;
      title = triggerMetaOf(trigger).title;
    } else if (node.type.startsWith("write.") && raw.spec && typeof raw.spec === "object") {
      const spec = raw.spec as EffectDefinition;
      domain = effectVocabularyOf(spec.type).domain;
      subtitle = raw.effectIndex !== undefined ? `effects[${raw.effectIndex}]` : undefined;
    }
    nodes.push({
      id: node.id,
      kind,
      title,
      subtitle,
      domain,
      domainLabel: domain ? EFFECT_DOMAIN_LABELS[domain] : undefined,
      depth,
      params: nodeParams(node),
      position: { x: depth * COLUMN_X, y: row * ROW_Y },
      source: sources[node.id],
    });
    payloads[node.id] = node.type.startsWith("write.") ? (raw.spec ?? raw) : raw;
  }

  const edges: ViewEdge[] = program.edges.map((edge) => ({
    id: `${edge.from.node}:${edge.from.port}->${edge.to.node}:${edge.to.port}`,
    from: edge.from.node,
    to: edge.to.node,
    label: edge.kind === "data" ? (EDGE_PORT_LABELS[edge.from.port] ?? edge.from.port) : undefined,
  }));

  return { nodes, edges, payloads };
}
