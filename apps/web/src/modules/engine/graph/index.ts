/** 引擎执行图（G0/G1）入口。 */

export * from "./types";
export { NodeTypeRegistry } from "./registry";
export { registerBuiltins } from "./builtins";
export { runProgram, validateProgram, programHash, type RunProgramOptions, type ValidationIssue } from "./interpreter";

import { registerBuiltins } from "./builtins";
import { NodeTypeRegistry } from "./registry";

/** 建一个装了全部内建节点类型的注册表（后续扩展在此追加）。 */
export function createRegistry(): NodeTypeRegistry {
  const registry = new NodeTypeRegistry();
  registerBuiltins(registry);
  return registry;
}
