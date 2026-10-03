/** G2 机制编译器：`mechanisms.json` DSL（MechanismDefinition）→ 执行图（Program）。
 *
 * 编译口径（与 dispatch + apply 语义对齐）：
 * - 触发 → `on.<trigger>` 入口（全触发器注册，从词汇表同源）。
 * - `when`（全部满足）→ `read.path` / `read.ref` / `cmp.*` / `logic.*` 条件子图 → `flow.branch`；
 *   条件求值复用 conditions 同一套 readPath / resolveRef，零语义漂移。
 * - `oncePerTurn`（passive 不计次）→ `flow.gate`（withSide 对齐 `${actorSide ?? "-"}:${机制 id}` 键），
 *   且置于条件之后——与 collect「先条件、后门」的过滤顺序一致。
 * - `effects` → `write.*` 链，按应用域分段：**行动域 → 状态域 → 伤害域**（段内保持 DSL 原序），
 *   对齐 simulate 的 applyActionCommands → applyStateCommands → applyDamageCommands 三段协议；
 *   每个写入节点携带 `spec`（完整 EffectDefinition）+ `mechanismId / ownerType / ownerId / effectIndex` 元数据。
 * - 跨机制排序（priority / id）属调度语义，留在 dispatch 侧；本编译器以单机制为单位产出程序，
 *   `compileMechanisms` 合并时按 collect 同序排列子图。
 * - **`sources`**（G3b）：每个节点 id → 它源自哪条 DSL 位置（`when[i]` 叶子的哪个字段 / `effects[j]` / 门 / 入口），
 *   供工作台把「点程序节点」精确映射回可编辑的 DSL 字段。
 *
 * 迁移边界（与设计稿 §13.5 一致）：出现无对应 write 节点的效果类型时，`validateProgram` 报未知类型——人工兜底。
 */

import type { Condition, EffectDefinition, MechanismDefinition } from "../mechanisms";
import { ACTION_EFFECT_TYPES } from "./action-types";
import type { GraphEdge, GraphNode, Program } from "./types";

/** 节点的 DSL 源头：工作台据此把程序节点映射回可编辑的机制字段。 */
export interface NodeSource {
  role: "entry" | "gate" | "combinator" | "condition" | "effect";
  /** 条件子树所属的 `when[]` 下标（combinator 若横跨多条件则缺省）。 */
  when?: number;
  /** 叶子在该条件树内的子索引路径（如 `[2]`、`[0,1]`；根叶子为空数组）。 */
  leaf?: number[];
  /** 叶子上本节点负责的字段。 */
  field?: "path" | "value" | "op" | "valueFrom";
  /** 效果所属的 `effects[]` **原序**下标（效果链按应用域分段重排，此处仍为 DSL 序）。 */
  effect?: number;
}

export interface CompiledMechanism {
  program: Program;
  entry: string;
  sources: Record<string, NodeSource>;
}

/** 条件定位：`when[when]` 内、沿子索引走到 `leaf` 的条件节点。 */
interface CondLoc {
  when: number;
  leaf: number[];
}

/** 伤害域（applyDamageCommands 通道）；其余状态类效果走 applyStateCommands。 */
const DAMAGE_TYPES: ReadonlySet<string> = new Set(["dealDamage"]);

function control(from: string, fromPort: string, to: string): GraphEdge {
  return { from: { node: from, port: fromPort }, to: { node: to, port: "in" }, kind: "control" };
}

function data(from: string, fromPort: string, to: string, toPort: string): GraphEdge {
  return { from: { node: from, port: fromPort }, to: { node: to, port: toPort }, kind: "data" };
}

interface Builder {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: Record<string, NodeSource>;
  nextId: (tag: string) => string;
}

/** 条件片段：产出值的节点（data 边可接）。 */
interface Fragment {
  node: string;
  port: string;
}

function compileCondition(cond: Condition, b: Builder, loc: CondLoc): Fragment {
  const at = (leaf: number[]): CondLoc => ({ when: loc.when, leaf: [...loc.leaf, ...leaf] });
  if ("allOf" in cond) {
    return foldLogic("logic.and", cond.allOf, cond.allOf.length === 0, b, { role: "combinator", ...loc }, (i) => at([i]));
  }
  if ("anyOf" in cond) {
    return foldLogic("logic.or", cond.anyOf, cond.anyOf.length === 0, b, { role: "combinator", ...loc }, (i) => at([i]));
  }
  if ("not" in cond) {
    const inner = compileCondition(cond.not, b, at([0]));
    const id = b.nextId("not");
    b.nodes.push({ id, type: "logic.not" });
    b.sources[id] = { role: "combinator", ...loc };
    b.edges.push(data(inner.node, inner.port, id, "a"));
    return { node: id, port: "value" };
  }
  // 叶子：path vs 期望值（literal 或动态引用）
  const pathId = b.nextId("p");
  b.nodes.push({ id: pathId, type: "read.path", params: { path: cond.path } });
  b.sources[pathId] = { role: "condition", ...loc, field: "path" };
  let expected: Fragment;
  if (cond.valueFrom !== undefined) {
    const refId = b.nextId("ref");
    b.nodes.push({ id: refId, type: "read.ref", params: { ref: cond.valueFrom } });
    b.sources[refId] = { role: "condition", ...loc, field: "valueFrom" };
    expected = { node: refId, port: "value" };
  } else {
    const litId = b.nextId("lit");
    b.nodes.push({ id: litId, type: "read.literal", params: { value: cond.value } });
    b.sources[litId] = { role: "condition", ...loc, field: "value" };
    expected = { node: litId, port: "value" };
  }
  const cmpType = cond.op === "has" ? "cmp.has" : cond.op === "contains" ? "cmp.contains" : `cmp.${cond.op}`;
  const cmpId = b.nextId("cmp");
  b.nodes.push({ id: cmpId, type: cmpType });
  b.sources[cmpId] = { role: "condition", ...loc, field: "op" };
  b.edges.push(data(pathId, "value", cmpId, "a"));
  b.edges.push(data(expected.node, expected.port, cmpId, "b"));
  return { node: cmpId, port: "value" };
}

/** 折叠为二元逻辑链（空集合语义与 conditionsMatch 一致：allOf [] = 真，anyOf [] = 假）。 */
function foldLogic(
  type: "logic.and" | "logic.or",
  items: Condition[],
  emptyValue: boolean,
  b: Builder,
  foldSource: NodeSource,
  childLoc: (index: number) => CondLoc,
): Fragment {
  if (items.length === 0) {
    const litId = b.nextId("lit");
    b.nodes.push({ id: litId, type: "read.literal", params: { value: emptyValue } });
    b.sources[litId] = foldSource;
    return { node: litId, port: "value" };
  }
  const frags = items.map((item, index) => compileCondition(item, b, childLoc(index)));
  return frags.reduce((acc, frag) => {
    const id = b.nextId(type === "logic.and" ? "and" : "or");
    b.nodes.push({ id, type });
    b.sources[id] = foldSource;
    b.edges.push(data(acc.node, acc.port, id, "a"));
    b.edges.push(data(frag.node, frag.port, id, "b"));
    return { node: id, port: "value" };
  });
}

function compileConditions(conditions: Condition[], b: Builder): Fragment {
  if (conditions.length === 1) return compileCondition(conditions[0], b, { when: 0, leaf: [] });
  return foldLogic("logic.and", conditions, true, b, { role: "combinator" }, (i) => ({ when: i, leaf: [] }));
}

/** 单机制 → 独立程序（含节点 → DSL 源头映射）。 */
export function compileMechanism(def: MechanismDefinition): CompiledMechanism {
  const b: Builder = {
    nodes: [],
    edges: [],
    sources: {},
    nextId: (() => {
      let seq = 0;
      return (tag: string) => `${def.id}#${tag}${seq++}`;
    })(),
  };

  // 1) 触发入口（携带机制元数据：ProgramCollector 据此做 priority/id 排序与身份识别）
  const entry = b.nextId("entry");
  b.nodes.push({
    id: entry,
    type: `on.${def.trigger}`,
    params: { mechanismId: def.id, ownerType: def.ownerType, ownerId: def.ownerId, priority: def.priority ?? 0 },
    position: { x: 0, y: 0 },
  });
  b.sources[entry] = { role: "entry" };
  let head = entry;
  let headPort = "out";
  let row = 1;

  // 2) when 条件子图 → 分支（collect：先条件、后 oncePerTurn 门）
  if (def.when?.length) {
    const frag = compileConditions(def.when, b);
    const branch = b.nextId("branch");
    b.nodes.push({ id: branch, type: "flow.branch", position: { x: 0, y: row++ * 120 } });
    b.sources[branch] = { role: "combinator" };
    b.edges.push(control(head, headPort, branch));
    b.edges.push(data(frag.node, frag.port, branch, "cond"));
    head = branch;
    headPort = "then";
  }

  // 3) oncePerTurn 门（passive 按 collect 语义不计次）
  if (def.oncePerTurn && def.trigger !== "passive") {
    const gate = b.nextId("gate");
    b.nodes.push({ id: gate, type: "flow.gate", params: { key: def.id, withSide: true }, position: { x: 0, y: row++ * 120 } });
    b.sources[gate] = { role: "gate" };
    b.edges.push(control(head, headPort, gate));
    head = gate;
    headPort = "out";
  }

  // 4) 效果链：行动域 → 状态域 → 伤害域（段内保序），对齐三段应用协议
  const indexed = def.effects.map((effect, index) => ({ effect, index }));
  const ordered = [
    ...indexed.filter(({ effect }) => ACTION_EFFECT_TYPES.has(effect.type)),
    ...indexed.filter(({ effect }) => !ACTION_EFFECT_TYPES.has(effect.type) && !DAMAGE_TYPES.has(effect.type)),
    ...indexed.filter(({ effect }) => DAMAGE_TYPES.has(effect.type)),
  ];
  for (const { effect, index } of ordered) {
    const writeId = b.nextId("w");
    b.nodes.push({
      id: writeId,
      type: `write.${(effect as EffectDefinition).type}`,
      params: { mechanismId: def.id, ownerType: def.ownerType, ownerId: def.ownerId, effectIndex: index, spec: effect },
      position: { x: 0, y: row++ * 120 },
    });
    b.sources[writeId] = { role: "effect", effect: index };
    b.edges.push(control(head, headPort, writeId));
    head = writeId;
    headPort = "out";
  }

  return { program: { programVersion: "1.0.0", nodes: b.nodes, edges: b.edges, entries: [entry] }, entry, sources: b.sources };
}

/** 全量机制 → 合并程序（按 collect 的 priority desc / id asc 排列子图；entries 与之同序）。 */
export function compileMechanisms(defs: MechanismDefinition[]): Program {
  const sorted = [...defs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const entries: string[] = [];
  for (const def of sorted) {
    const { program, entry } = compileMechanism(def);
    nodes.push(...program.nodes);
    edges.push(...program.edges);
    entries.push(entry);
  }
  return { programVersion: "1.0.0", nodes, edges, entries };
}
