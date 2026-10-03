/** 执行图解释器（G0）：走程序 → 逐节点执行 → 记 trace。
 *
 * - 控制流沿 `control` 边游走；数据流沿 `data` 边**拉取**（调用方不感知求值顺序）。
 * - 副作用只来自节点执行器；每次执行记录输入 / 输出 / 状态增量 / 父节点。
 * - 无 `eval`：节点执行器是注册的强类型函数。
 */

import { cloneState } from "../state";
import { Rng } from "../rng";
import { MechanismRegistry, MechanismRuntime, type ActionQueue, type TriggerName } from "../mechanisms";
import type { Action, DataBundle, Dict, Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { GraphNode, Program, RunResult, StateMutation, TraceEntry } from "./types";

const MAX_STEPS = 5000;

export interface RunProgramOptions {
  program: Program;
  registry: NodeTypeRegistry;
  bundle: DataBundle;
  state: RunResult["state"];
  /** 入口事件节点 id。 */
  entry: string;
  event?: Dict;
  seed?: number;
  /** 机制触发器；缺省从入口节点类型（`on.*`）推导，未识别时回退 beforeAction。 */
  trigger?: TriggerName;
  /** 派发侧 / 目标侧（与 dispatch 上下文一致时，条件作用域与命令装配同源）。 */
  actorSide?: Side;
  targetSide?: Side;
  action?: Action;
  sourceId?: string;
  /** 共享机制注册表：写入节点的级联触发 / ruleModifiers 与 dispatch 语义同源。 */
  mechanisms?: MechanismRegistry;
  /** 行动域上下文；缺省时行动类效果静默跳过（对齐 triggerState 应用协议）。 */
  actions?: { queue: ActionQueue; actionIds: Record<Side, string>; nextActionId: () => string };
  /** dealDamage 附加事件负载（对齐 applyDamageCommands.extraEvent）。 */
  extraEvent?: Dict;
}

export function runProgram(opts: RunProgramOptions): RunResult {
  const { program, registry, bundle } = opts;
  const state = cloneState(opts.state);
  const byId = new Map<string, GraphNode>(program.nodes.map((n) => [n.id, n]));
  const entryType = byId.get(opts.entry)?.type ?? "";
  const trigger: TriggerName = opts.trigger ?? (entryType.startsWith("on.") ? (entryType.slice(3) as TriggerName) : "beforeAction");
  const runtime = new MechanismRuntime(opts.mechanisms ?? new MechanismRegistry());

  const controlFrom = new Map<string, string[]>();
  const dataInto = new Map<string, { node: string; port: string }>();
  for (const edge of program.edges) {
    if (edge.kind === "control") {
      const key = `${edge.from.node}:${edge.from.port}`;
      controlFrom.set(key, [...(controlFrom.get(key) ?? []), edge.to.node]);
    } else {
      dataInto.set(`${edge.to.node}:${edge.to.port}`, { node: edge.from.node, port: edge.from.port });
    }
  }

  const trace: TraceEntry[] = [];
  const rng = new Rng(opts.seed ?? state.seed ?? 0);
  const event = opts.event ?? {};
  let seq = 0;
  let steps = 0;
  let currentParent: string | undefined;

  function typeOf(node: GraphNode) {
    const type = registry.get(node.type);
    if (!type) throw new Error(`未知节点类型: ${node.type}（节点 ${node.id}）`);
    return type;
  }

  function makeContext(node: GraphNode, inputs: Dict) {
    return {
      state,
      bundle,
      event,
      params: node.params ?? {},
      input: (port: string) => inputs[port],
      rng: () => rng.next(),
      trigger,
      actorSide: opts.actorSide ?? (event.actorSide as Side | undefined),
      targetSide: opts.targetSide,
      action: opts.action,
      sourceId: opts.sourceId,
      runtime,
      actions: opts.actions,
      extraEvent: opts.extraEvent,
    };
  }

  function evaluateDataNode(nodeId: string, visiting: Set<string>): Dict {
    if (visiting.has(nodeId)) throw new Error(`数据流成环: ${nodeId}`);
    const node = byId.get(nodeId);
    if (!node) throw new Error(`数据边指向不存在的节点: ${nodeId}`);
    visiting.add(nodeId);
    const inputs = collectInputs(node, visiting);
    const exec = typeOf(node).executor(makeContext(node, inputs));
    visiting.delete(nodeId);
    seq += 1;
    trace.push({ seq, node: nodeId, type: node.type, kind: "data", params: node.params, inputs, outputs: exec.outputs, parent: currentParent });
    return exec.outputs ?? {};
  }

  function collectInputs(node: GraphNode, visiting: Set<string>): Dict {
    const inputs: Dict = {};
    for (const port of typeOf(node).inputs) {
      const src = dataInto.get(`${node.id}:${port.name}`);
      if (!src) {
        inputs[port.name] = undefined;
        continue;
      }
      inputs[port.name] = evaluateDataNode(src.node, visiting)[src.port];
    }
    return inputs;
  }

  function runControl(nodeId: string, parent?: string): void {
    steps += 1;
    if (steps > MAX_STEPS) throw new Error("执行图超过最大步数（可能存在控制环）");
    const node = byId.get(nodeId);
    if (!node) throw new Error(`控制边指向不存在的节点: ${nodeId}`);
    const type = typeOf(node);
    const inputs = collectInputs(node, new Set());
    currentParent = nodeId;
    const exec = type.executor(makeContext(node, inputs));
    const mutations: StateMutation[] = exec.mutations ?? [];
    seq += 1;
    trace.push({ seq, node: nodeId, type: node.type, kind: "control", params: node.params, inputs, outputs: exec.outputs, mutations: mutations.length ? mutations : undefined, parent });
    for (const port of exec.control ?? type.controlOut ?? []) {
      for (const target of controlFrom.get(`${nodeId}:${port}`) ?? []) runControl(target, nodeId);
    }
  }

  runControl(opts.entry);
  return { state, trace };
}

export interface ValidationIssue {
  level: "error" | "warning";
  node?: string;
  message: string;
}

/** 校验程序：节点类型存在、端口存在、控制流无环、entry 存在、必填参数已给。 */
export function validateProgram(program: Program, registry: NodeTypeRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(program.nodes.map((n) => [n.id, n]));
  for (const node of program.nodes) {
    const type = registry.get(node.type);
    if (!type) {
      issues.push({ level: "error", node: node.id, message: `未知节点类型: ${node.type}` });
      continue;
    }
    for (const param of type.params) {
      if (!param.required) continue;
      const direct = node.params?.[param.name];
      // 编译程序经 `spec`（完整 EffectDefinition）透传必填字段——与具名参数等价满足。
      const specField = (node.params?.spec as Record<string, unknown> | undefined)?.[param.name];
      const empty = (value: unknown) => value === undefined || value === "";
      if (empty(direct) && empty(specField)) {
        issues.push({ level: "error", node: node.id, message: `缺少必填参数: ${param.name}` });
      }
    }
    const inPorts = new Set([...type.inputs.map((p) => p.name), ...(type.controlIn ? ["in"] : [])]);
    const outPorts = new Set([...type.outputs.map((p) => p.name), ...(type.controlOut ?? [])]);
    for (const edge of program.edges) {
      if (edge.from.node === node.id && !outPorts.has(edge.from.port)) issues.push({ level: "error", node: node.id, message: `不存在的输出端口: ${edge.from.port}` });
      if (edge.to.node === node.id && !inPorts.has(edge.to.port)) issues.push({ level: "error", node: node.id, message: `不存在的输入端口: ${edge.to.port}` });
    }
  }
  for (const edge of program.edges) {
    if (!byId.has(edge.from.node)) issues.push({ level: "error", message: `边引用了不存在的节点: ${edge.from.node}` });
    if (!byId.has(edge.to.node)) issues.push({ level: "error", message: `边引用了不存在的节点: ${edge.to.node}` });
  }
  const controlAdj = new Map<string, string[]>();
  for (const edge of program.edges) {
    if (edge.kind !== "control") continue;
    controlAdj.set(edge.from.node, [...(controlAdj.get(edge.from.node) ?? []), edge.to.node]);
  }
  const marks = new Map<string, 0 | 1 | 2>();
  const hasCycle = (id: string): boolean => {
    const mark = marks.get(id) ?? 0;
    if (mark === 1) return true;
    if (mark === 2) return false;
    marks.set(id, 1);
    for (const next of controlAdj.get(id) ?? []) if (hasCycle(next)) return true;
    marks.set(id, 2);
    return false;
  };
  for (const node of program.nodes) {
    if (hasCycle(node.id)) {
      issues.push({ level: "error", node: node.id, message: "控制流存在环" });
      break;
    }
  }
  for (const entry of program.entries) if (!byId.has(entry)) issues.push({ level: "error", message: `入口节点不存在: ${entry}` });
  return issues;
}

/** 程序内容哈希（djb2；用于回放/试跑比对）。 */
export function programHash(program: Program): string {
  const rest: Program = { ...program };
  delete rest.hash;
  const text = JSON.stringify(rest);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
