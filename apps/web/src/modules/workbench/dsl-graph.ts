/** 机制 DSL → 只读视图图（工作台 G3a 投影）。
 *
 * 澄清（见《引擎执行图》G3a 注）：本投影**不是**「程序（执行图）」、不被引擎执行、不是事实源——
 * 它把 `mechanisms.json` 的 trigger / when / effects DSL 摊成节点图供可视化浏览。
 * G2 编译器落地后，`/engine` 画布切换为真程序图，本投影仅作对照视图。
 *
 * 纯函数、无 DOM 依赖，可单测。
 */

import type { Condition, DynamicValue, EffectDefinition, MechanismDefinition } from "@/modules/engine/mechanisms/types";
import {
  CONDITION_COMBINATOR_LABELS,
  CONDITION_OP_LABELS,
  EFFECT_DOMAIN_LABELS,
  effectVocabularyOf,
  triggerMetaOf,
  type EffectDomain,
} from "@/modules/engine/mechanisms/vocabulary";

export type ViewNodeKind = "trigger" | "condition" | "combinator" | "effect";

export interface ParamView {
  key: string;
  label: string;
  value: unknown;
  /** 预渲染展示文本（动态取值展开为 `路径 ×系数 +偏移 …`）。 */
  display: string;
  /** 值是动态取值（`DynamicRef` / `DynamicValue`）时为 true，UI 渲染成徽章。 */
  dynamic: boolean;
  /** 嵌套效果列表的子节点 id（scheduleEntry / consumeMark / scheduleEffect）。 */
  children?: string[];
}

export interface ViewNode {
  id: string;
  kind: ViewNodeKind;
  title: string;
  subtitle?: string;
  domain?: EffectDomain;
  domainLabel?: string;
  depth: number;
  params: ParamView[];
  position: { x: number; y: number };
}

export interface ViewEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface MechanismGraph {
  nodes: ViewNode[];
  edges: ViewEdge[];
  /** 与节点 id 对齐的原始负载（详情面板展示 JSON）。 */
  payloads: Record<string, unknown>;
}

const COLUMN_X = 240;
const ROW_Y = 96;

interface Layout {
  depth: number;
  row: number;
}

/** 动态取值判定：对象带 `path`（`DynamicValue`），或路径式字符串（含 `.`，如 `self.active.hp`）。
 *  纯枚举字符串（`target`/`markId`/`scope` 等）不算动态。 */
function isDynamicRef(value: unknown): boolean {
  if (typeof value === "object" && value !== null) return "path" in (value as Record<string, unknown>);
  return typeof value === "string" && value.includes(".");
}

function describeDynamic(value: unknown): string {
  if (typeof value === "string") return value;
  const spec = (value ?? {}) as Partial<DynamicValue>;
  const parts: string[] = [String(spec.path ?? "")];
  if (spec.scale !== undefined) parts.push(`×${spec.scale}`);
  if (spec.offset) parts.push(`${spec.offset >= 0 ? "+" : ""}${spec.offset}`);
  if (spec.terms?.length) parts.push(`多项式(${spec.terms.length}项)`);
  if (spec.count) parts.push(`计数 ${Object.entries(spec.count).map(([k, v]) => `${k}=${v}`).join(",")}`);
  if (spec.countKeys) parts.push("键计数");
  return parts.filter(Boolean).join(" ");
}

function valueText(value: unknown): string {
  if (value === undefined) return "—";
  if (isDynamicRef(value)) return describeDynamic(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => valueText(v)).join(" / ");
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0][0] === "path") return String(entries[0][1]);
    return JSON.stringify(value);
  }
  return String(value);
}

function conditionTitle(cond: Condition): string {
  if ("allOf" in cond) return CONDITION_COMBINATOR_LABELS.allOf;
  if ("anyOf" in cond) return CONDITION_COMBINATOR_LABELS.anyOf;
  if ("not" in cond) return CONDITION_COMBINATOR_LABELS.not;
  const op = CONDITION_OP_LABELS[cond.op] ?? cond.op;
  const rhs = cond.valueFrom !== undefined ? describeDynamic(cond.valueFrom) : valueText(cond.value);
  return `${cond.path} ${op} ${rhs}`;
}

function makeParam(key: string, label: string, value: unknown, dynamic = false, children?: string[]): ParamView {
  return { key, label, value, display: children?.length ? `（${children.length} 个子效果）` : valueText(value), dynamic, children };
}

function conditionParams(cond: Condition): ParamView[] {
  if ("allOf" in cond || "anyOf" in cond || "not" in cond) return [];
  return [
    makeParam("path", "取值路径", cond.path),
    makeParam("op", "算子", CONDITION_OP_LABELS[cond.op] ?? cond.op),
    makeParam("value", cond.valueFrom !== undefined ? "比较值（动态）" : "比较值", cond.valueFrom !== undefined ? cond.valueFrom : cond.value, cond.valueFrom !== undefined),
  ];
}

/** 嵌套效果字段：效果命令里携带子效果列表的参数名。 */
const NESTED_EFFECT_FIELDS = ["effects", "effectsPerLayer", "effectsOnConsume"] as const;

function nestedEffectsOf(effect: EffectDefinition): { field: string; list: EffectDefinition[] }[] {
  const out: { field: string; list: EffectDefinition[] }[] = [];
  for (const field of NESTED_EFFECT_FIELDS) {
    const list = (effect as unknown as Record<string, unknown>)[field];
    if (Array.isArray(list) && list.length) out.push({ field, list: list as EffectDefinition[] });
  }
  return out;
}

function effectParams(effect: EffectDefinition, childIds: Record<string, string[]>): ParamView[] {
  const vocab = effectVocabularyOf(effect.type);
  const raw = { ...(effect as unknown as Record<string, unknown>) };
  delete raw.type;
  delete raw.chance;
  const params: ParamView[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const nested = childIds[key];
    params.push(
      nested
        ? makeParam(key, vocab.params?.[key] ?? key, value, false, nested)
        : makeParam(key, vocab.params?.[key] ?? key, value, isDynamicRef(value)),
    );
  }
  if (effect.chance !== undefined) {
    params.push(makeParam("chance", "概率", effect.chance));
  }
  return params;
}

/** 机制 → 只读视图图。布局为分层列（depth 列、行内递增），够浏览用；不做自动避让。 */
export function toMechanismGraph(def: MechanismDefinition): MechanismGraph {
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  const payloads: Record<string, unknown> = {};
  const layout = new Map<string, Layout>();
  const rows = new Map<number, number>();

  const place = (id: string, depth: number): Layout => {
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    const box: Layout = { depth, row };
    layout.set(id, box);
    return box;
  };

  const pushNode = (id: string, kind: ViewNodeKind, title: string, subtitle: string | undefined, domain: EffectDomain | undefined, depth: number, params: ParamView[], payload: unknown) => {
    const box = place(id, depth);
    nodes.push({
      id,
      kind,
      title,
      subtitle,
      domain,
      domainLabel: domain ? EFFECT_DOMAIN_LABELS[domain] : undefined,
      depth: box.depth,
      params,
      position: { x: box.depth * COLUMN_X, y: box.row * ROW_Y },
    });
    payloads[id] = payload;
  };

  const connect = (from: string, to: string, label?: string) => {
    edges.push({ id: `${from}->${to}`, from, to, label });
  };

  const triggerMeta = triggerMetaOf(def.trigger);
  pushNode("n:trigger", "trigger", triggerMeta.title, def.trigger, undefined, 0, [], { trigger: def.trigger });

  let lastId = "n:trigger";
  let depth = 1;

  const walkCondition = (cond: Condition, id: string, condDepth: number, parentId: string): void => {
    if ("allOf" in cond || "anyOf" in cond || "not" in cond) {
      const combinator: "allOf" | "anyOf" | "not" = "allOf" in cond ? "allOf" : "anyOf" in cond ? "anyOf" : "not";
      const children: Condition[] = "allOf" in cond ? cond.allOf : "anyOf" in cond ? cond.anyOf : [cond.not];
      pushNode(id, "combinator", CONDITION_COMBINATOR_LABELS[combinator], combinator, undefined, condDepth, [], cond);
      connect(parentId, id);
      children.forEach((child: Condition, index: number) => walkCondition(child, `${id}.${index}`, condDepth + 1, id));
    } else {
      pushNode(id, "condition", conditionTitle(cond), undefined, undefined, condDepth, conditionParams(cond), cond);
      connect(parentId, id);
    }
  };

  for (const [index, cond] of (def.when ?? []).entries()) {
    const id = `n:when.${index}`;
    walkCondition(cond, id, depth, lastId);
    lastId = id;
    depth += 1;
  }

  const walkEffects = (list: EffectDefinition[], prefix: string, fromId: string, edgeLabel: string | undefined, baseDepth: number): string[] => {
    const ids: string[] = [];
    let previous = fromId;
    for (const [index, effect] of list.entries()) {
      const id = `${prefix}.${index}`;
      const vocab = effectVocabularyOf(effect.type);
      const childIds: Record<string, string[]> = {};
      const nested = nestedEffectsOf(effect);
      // 先占位、再挂子效果，保证子效果列在父效果右侧。
      pushNode(id, "effect", vocab.title, effect.type, vocab.domain, baseDepth, [], effect);
      connect(previous, id, index === 0 ? edgeLabel : undefined);
      previous = id;
      ids.push(id);
      for (const { field, list: sub } of nested) {
        const childList = walkEffects(sub, `${id}.${field}`, id, field, baseDepth + 1);
        childIds[field] = childList;
      }
      const node = nodes.find((n) => n.id === id);
      if (node) node.params = effectParams(effect, childIds);
    }
    return ids;
  };

  walkEffects(def.effects ?? [], "n:eff", lastId, "效果", depth);

  return { nodes, edges, payloads };
}
