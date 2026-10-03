/** 执行图解释器（G0/G2b）：走程序 → 逐节点执行 → 记 trace。
 *
 * - 控制流沿 `control` 边游走；数据流沿 `data` 边**拉取**（调用方不感知求值顺序）。
 * - 副作用只来自节点执行器；每次执行记录输入 / 输出 / 状态增量 / 父节点。
 * - 无 `eval`：节点执行器是注册的强类型函数。
 * - **collect 模式（G2b）**：写入节点只装配命令入缓冲、不结算；不克隆状态（`flow.gate` 的 oncePerTurn 标记
 *   落在传入状态上，与 `MechanismRegistry.collect` 的分发期标记同点位）；不记 trace（每次 dispatch 只跑
 *   条件链，量大且无消费者）。供 `ProgramCollector` 实现程序化 dispatch。
 */

import { cloneState } from "../state";
import { Rng } from "../rng";
import { MechanismRuntime, type ActionQueue, type MechanismSource, type TriggerName } from "../mechanisms";
import type { Action, DataBundle, Dict, Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { EffectCommand } from "../mechanisms";
import type { GraphNode, Program, RunResult, StateMutation, TraceEntry } from "./types";

const MAX_STEPS = 5000;

export interface RunProgramOptions {
  program: Program;
  registry: NodeTypeRegistry;
  bundle: DataBundle;
  state: RunResult["state"];
  /** 入口事件节点 id（与 `entries` 二选一，`entries` 优先）。 */
  entry?: string;
  /** 多入口：同一次调用按给定顺序逐条执行（程序化 collect 一次 dispatch 跑全部命中机制链）。 */
  entries?: string[];
  event?: Dict;
  seed?: number;
  /** 机制触发器；缺省从入口节点类型（`on.*`）推导，未识别时回退 beforeAction。 */
  trigger?: TriggerName;
  /** 派发侧 / 目标侧（与 dispatch 上下文一致时，条件作用域与命令装配同源）。 */
  actorSide?: Side;
  targetSide?: Side;
  action?: Action;
  sourceId?: string;
  /** 共享机制收集器：写入节点的级联触发 / ruleModifiers 与 dispatch 语义同源。 */
  mechanisms?: MechanismSource;
  /** 行动域上下文；缺省时行动类效果静默跳过（对齐 triggerState 应用协议）。 */
  actions?: { queue: ActionQueue; actionIds: Record<Side, string>; nextActionId: () => string };
  /** dealDamage 附加事件负载（对齐 applyDamageCommands.extraEvent）。 */
  extraEvent?: Dict;
  /** collect 模式：写入节点装配命令入缓冲不结算、不克隆状态、不记 trace（程序化 dispatch）。 */
  mode?: "apply" | "collect";
}

/** 程序结构索引（byId / 控制边 / 数据边）：按 Program 实例缓存——同一程序跨多次 dispatch 复用，避免每次重建。 */
const structuralCache = new WeakMap<Program, { byId: Map<string, GraphNode>; controlFrom: Map<string, string[]>; dataInto: Map<string, { node: string; port: string }> }>();

function structuralIndex(program: Program) {
  const cached = structuralCache.get(program);
  if (cached) return cached;
  const byId = new Map<string, GraphNode>(program.nodes.map((n) => [n.id, n]));
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
  const index = { byId, controlFrom, dataInto };
  structuralCache.set(program, index);
  return index;
}

export function runProgram(opts: RunProgramOptions): RunResult {
  const { program, registry, bundle } = opts;
  const entryList = opts.entries ?? (opts.entry !== undefined ? [opts.entry] : []);
  if (!entryList.length) throw new Error("runProgram 缺少入口（entry / entries）");
  const collectMode = opts.mode === "collect";
  // collect 模式不克隆：gate 标记与 legacy collect 一样落在调用方状态上。
  const state = collectMode ? opts.state : cloneState(opts.state);
  const { byId, controlFrom, dataInto } = structuralIndex(program);
  const entryType = byId.get(entryList[0])?.type ?? "";
  const trigger: TriggerName = opts.trigger ?? (entryType.startsWith("on.") ? (entryType.slice(3) as TriggerName) : "beforeAction");
  const runtime = new MechanismRuntime(opts.mechanisms ?? { collect: () => [] });

  const trace: TraceEntry[] = [];
  const commands: EffectCommand[] | undefined = collectMode ? [] : undefined;
  // RNG 懒建：collect 模式（条件/门/装配命令）从不抽随机数，省去每次调用的 Rng 构造。
  let rngObj: Rng | undefined;
  const rng = () => (rngObj ??= new Rng(opts.seed ?? state.seed ?? 0)).next();
  const event = opts.event ?? {};
  let seq = 0;
  let steps = 0;
  let currentParent: string | undefined;

  // shell 上下文：executors 不持有 ctx，故整次调用复用同一对象，仅逐节点切换 params / inputs，
  // 省去每节点两次闭包分配（大程序 collect 的主要固定开销）。
  let currentInputs: Dict = {};
  const shell = {
    state,
    bundle,
    event,
    params: {} as Dict,
    input: (port: string) => currentInputs[port],
    rng,
    trigger,
    actorSide: opts.actorSide ?? (event.actorSide as Side | undefined),
    targetSide: opts.targetSide,
    action: opts.action,
    sourceId: opts.sourceId,
    runtime,
    actions: opts.actions,
    extraEvent: opts.extraEvent,
    collect: commands,
  };

  function typeOf(node: GraphNode) {
    const type = registry.get(node.type);
    if (!type) throw new Error(`未知节点类型: ${node.type}（节点 ${node.id}）`);
    return type;
  }

  function makeContext(node: GraphNode, inputs: Dict) {
    shell.params = node.params ?? {};
    currentInputs = inputs;
    return shell;
  }

  function evaluateDataNode(nodeId: string, visiting: Set<string>): Dict {
    if (visiting.has(nodeId)) throw new Error(`数据流成环: ${nodeId}`);
    const node = byId.get(nodeId);
    if (!node) throw new Error(`数据边指向不存在的节点: ${nodeId}`);
    visiting.add(nodeId);
    const inputs = collectInputs(node, visiting);
    const exec = typeOf(node).executor(makeContext(node, inputs));
    visiting.delete(nodeId);
    if (!collectMode) {
      seq += 1;
      trace.push({ seq, node: nodeId, type: node.type, kind: "data", params: node.params, inputs, outputs: exec.outputs, parent: currentParent });
    }
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
    if (!collectMode) {
      seq += 1;
      trace.push({ seq, node: nodeId, type: node.type, kind: "control", params: node.params, inputs, outputs: exec.outputs, mutations: mutations.length ? mutations : undefined, parent });
    }
    for (const port of exec.control ?? type.controlOut ?? []) {
      for (const target of controlFrom.get(`${nodeId}:${port}`) ?? []) runControl(target, nodeId);
    }
  }

  // 逐入口执行（每入口独立步数预算，避免大程序多入口共享上限）。
  for (const entryId of entryList) {
    steps = 0;
    runControl(entryId);
  }
  return { state, trace, commands };
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
