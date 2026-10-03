/** 工作台校验（纯逻辑，无 fs / 无 data 依赖）：单条机制定义 → 编译 → `validateProgram` issue 列表。
 *
 *  独立成模块是刻意的：客户端（handlers 的 `parseState` 等纯导出被页面复用）与写回处理器（fs）
 *  都要用它——放在任一侧都会把另一侧拖下水（曾因此把 `node:fs` 打进客户端 chunk 导致构建失败）。
 */

import { compileMechanism, createRegistry, validateProgram } from "../graph";
import type { MechanismDefinition } from "../mechanisms";

export interface CompileIssue {
  level: string;
  node?: string;
  message: string;
}

/** 节点类型注册表（进程内单例；节点目录由它导出，编辑器语义不漂移）。 */
export const NODE_REGISTRY = createRegistry();

/** 编译 + 校验一条机制定义（未知效果类型 / 缺必填参数 / 端口不匹配在此暴露）。 */
export function compileIssues(def: unknown): CompileIssue[] {
  try {
    const { program } = compileMechanism(def as MechanismDefinition);
    return validateProgram(program, NODE_REGISTRY).map((issue) => ({ level: issue.level, node: issue.node, message: issue.message }));
  } catch (err) {
    return [{ level: "error", message: (err as Error).message }];
  }
}
