/** 节点类型注册表：原语（指令）在此注册，可插拔。 */

import type { NodeType } from "./types";

export class NodeTypeRegistry {
  private readonly types = new Map<string, NodeType>();

  register(type: NodeType): void {
    if (this.types.has(type.type)) throw new Error(`节点类型重复注册: ${type.type}`);
    this.types.set(type.type, type);
  }

  get(type: string): NodeType | undefined {
    return this.types.get(type);
  }

  has(type: string): boolean {
    return this.types.has(type);
  }

  all(): NodeType[] {
    return [...this.types.values()];
  }

  /** 供编辑器使用的 schema 目录（剥离 executor，仅保留端口/参数/元信息）。 */
  catalog(): Omit<NodeType, "executor">[] {
    return this.all().map((type) => ({
      type: type.type,
      title: type.title,
      category: type.category,
      inputs: type.inputs,
      outputs: type.outputs,
      controlIn: type.controlIn,
      controlOut: type.controlOut,
      params: type.params,
      pure: type.pure,
      effect: type.effect,
    }));
  }
}
