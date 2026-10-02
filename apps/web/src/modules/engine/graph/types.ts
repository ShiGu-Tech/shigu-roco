/** 引擎执行图 · 类型定义（G0/G1）。
 *
 * 心智：**可插拔的原语节点（指令，代码） + 一份统一程序（配置） + 逐节点 trace**。
 * 节点类型是强类型执行器；程序（nodes/edges/resources）是唯一可编辑、可版本化的定义。
 */

import type { BattleState, DataBundle, Dict } from "../types";

export type PortType = "any" | "number" | "string" | "boolean" | "object" | "event" | "side";
export interface NodePort {
  name: string;
  type: PortType;
}

export type ParamType = "number" | "string" | "boolean" | "path" | "json";
export interface NodeParam {
  name: string;
  type: ParamType;
  required?: boolean;
  default?: unknown;
}

export type NodeCategory = "event" | "flow" | "read" | "math" | "logic" | "cmp" | "write" | "query" | "rng" | "resource";

export interface StateMutation {
  path: string;
  before: unknown;
  after: unknown;
}

export interface NodeExecution {
  outputs?: Dict;
  /** 执行后要继续走的控制输出端口（缺省 = 该节点的全部 `controlOut`，按序）。 */
  control?: string[];
  mutations?: StateMutation[];
}

export interface NodeContext {
  state: BattleState;
  bundle: DataBundle;
  event: Dict;
  params: Dict;
  /** 拉取某数据输入端口的当前值（由解释器沿数据边递归求值）。 */
  input: (port: string) => unknown;
  /** 确定性随机数 [0,1)。 */
  rng: () => number;
}

export type NodeExecutor = (ctx: NodeContext) => NodeExecution;

export interface NodeType {
  type: string;
  title: string;
  category: NodeCategory;
  inputs: NodePort[];
  outputs: NodePort[];
  /** 是否有控制输入（事件源为入口，无）。 */
  controlIn?: boolean;
  /** 命名的控制输出端口（如 flow.branch = ["then","else"]）；写入节点默认 ["out"]。 */
  controlOut?: string[];
  params: NodeParam[];
  /** 纯函数（无副作用，可缓存）。 */
  pure?: boolean;
  /** 是否修改状态（唯一副作用来源）。 */
  effect?: boolean;
  executor: NodeExecutor;
}

export interface GraphNode {
  id: string;
  type: string;
  params?: Dict;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  from: { node: string; port: string };
  to: { node: string; port: string };
  kind: "control" | "data";
}

export interface Program {
  programVersion: string;
  /** 内容哈希（回放/试跑比对）。 */
  hash?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 入口事件节点 id。 */
  entries: string[];
  /** 资源（系别克制 / 规则 / 公式 / 图鉴引用等），由节点按需读取。 */
  resources?: Dict;
}

export interface TraceEntry {
  seq: number;
  node: string;
  type: string;
  kind: "control" | "data";
  params?: Dict;
  inputs?: Dict;
  outputs?: Dict;
  mutations?: StateMutation[];
  parent?: string;
}

export interface RunResult {
  state: BattleState;
  trace: TraceEntry[];
}
