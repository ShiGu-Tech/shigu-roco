/** G2b 程序化 dispatch：`ProgramCollector` 实现 `MechanismSource`——把**程序**当 `collect` 源。
 *
 * 与 `MechanismRegistry.collect`（DSL 路径）逐语义对齐：
 * - 逐入口（= 逐机制）以 **collect 模式** 跑 `runProgram`：条件子图求值 → `flow.gate` 标记 oncePerTurn
 *   （先条件后门，与 collect 的两段过滤同序）→ 写入节点只装配命令入缓冲、不结算。
 * - **不克隆状态**：门标记落在调用方状态上，与 collect 的分发期标记同点位。
 * - 排序同 collect：机制 priority desc / id asc；机制内按 `effectIndex` 还原 DSL 原序
 *   （写入链按应用域分段排布，收集后须复位）。
 * - `programForBundle` 按 bundle 缓存编译产物（WeakMap；reloadBundle 换新对象即自然重建）。
 *
 * 已知边界：legacy collect 对全部机制「先跑完条件、再逐个标门」；本实现逐机制交错（标门 → 下一机制条件）。
 * 两者只在「条件读 `state.onceFired`」时可观测地不同——数据现状无此路径（回归守卫覆盖）。
 */

import { compileMechanisms } from "./compiler";
import { registerBuiltins } from "./builtins";
import { registerEffectNodes } from "./effect-nodes";
import { NodeTypeRegistry } from "./registry";
import { runProgram } from "./interpreter";
import type { Program } from "./types";
import { mechanismsFromData, type MechanismContext, type EffectCommand, type MechanismSource } from "../mechanisms";
import type { DataBundle, Dict } from "../types";

let sharedRegistry: NodeTypeRegistry | undefined;
/** 程序执行用节点注册表（模块级单例；与 `createRegistry` 同内容，避免 index 循环引用）。 */
function nodeRegistry(): NodeTypeRegistry {
  if (!sharedRegistry) {
    const registry = new NodeTypeRegistry();
    registerBuiltins(registry);
    registerEffectNodes(registry);
    sharedRegistry = registry;
  }
  return sharedRegistry;
}

/** bundle → 合并程序（WeakMap 缓存；bundle 重载即新对象、旧程序自然失效）。 */
const programCache = new WeakMap<DataBundle, Program>();

export function programForBundle(bundle: DataBundle): Program {
  let program = programCache.get(bundle);
  if (!program) {
    program = compileMechanisms(mechanismsFromData(bundle.mechanisms));
    programCache.set(bundle, program);
  }
  return program;
}

interface EntryPlan {
  id: string;
  trigger: string;
  mechanismId: string;
  priority: number;
}

export class ProgramCollector implements MechanismSource {
  private readonly plans: EntryPlan[];

  constructor(private readonly program: Program, private readonly bundle: DataBundle) {
    const byId = new Map(program.nodes.map((node) => [node.id, node]));
    this.plans = program.entries
      .map((id) => {
        const node = byId.get(id);
        if (!node) throw new Error(`程序入口不存在: ${id}`);
        const params = (node.params ?? {}) as Dict;
        return {
          id,
          trigger: node.type.startsWith("on.") ? node.type.slice(3) : "",
          mechanismId: String(params.mechanismId ?? id),
          priority: Number(params.priority ?? 0),
        };
      })
      // 与 collect 同序：priority desc → id asc（不依赖 program.entries 的书写顺序）。
      .sort((a, b) => b.priority - a.priority || a.mechanismId.localeCompare(b.mechanismId));
  }

  collect(context: MechanismContext): EffectCommand[] {
    // 命中该触发器的入口（plans 已按 priority desc / id asc 排序 = collect 排序）。
    const entries: string[] = [];
    for (const plan of this.plans) {
      if (plan.trigger && plan.trigger === context.trigger) entries.push(plan.id);
    }
    if (!entries.length) return [];
    // 一次 runProgram 跑完全部命中链（逐入口调用的固定开销 ≈ 每条链 2µs × 688，是程序源的主要性能开销）。
    const result = runProgram({
      program: this.program,
      registry: nodeRegistry(),
      bundle: this.bundle,
      state: context.state,
      entries,
      event: context.event,
      trigger: context.trigger,
      actorSide: context.actorSide,
      targetSide: context.targetSide,
      action: context.action,
      sourceId: context.sourceId,
      mode: "collect",
    });
    const commands = result.commands ?? [];
    // 写入链按应用域分段排布，这里按（机制序, effectIndex）复位为 DSL 序——与 collect 的 flatMap 输出逐位一致。
    // 入口本就按 plans 序执行（分组已正确），仅组内需按 effectIndex 排。
    const rank = new Map(this.plans.map((plan, index) => [plan.mechanismId, index]));
    commands.sort((a, b) => {
      const ra = rank.get(a.mechanismId) ?? 0;
      const rb = rank.get(b.mechanismId) ?? 0;
      return ra - rb || (a.effectIndex ?? 0) - (b.effectIndex ?? 0);
    });
    return commands;
  }
}

/** 便捷构造：bundle → 缓存程序 → 收集器（Simulator 默认走此路径）。 */
export function programCollectorFor(bundle: DataBundle): ProgramCollector {
  return new ProgramCollector(programForBundle(bundle), bundle);
}
