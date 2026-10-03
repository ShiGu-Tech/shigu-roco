import type { MechanismDefinition } from "@/modules/engine/mechanisms/types";

/** 工作台机制条目（`GET /api/engine/workbench/mechanisms` 返回项）。 */
export interface WorkbenchMechanism {
  id: string;
  ownerType: string;
  ownerId: string;
  ownerName: string;
  trigger: string;
  effectCount: number;
  unsupported: boolean;
  /** `registered:` 前缀 = 装配时按技能威力自动生成的基础伤害机制。 */
  registered: boolean;
  def: MechanismDefinition;
}

/** 节点类型目录项：由 `NodeTypeRegistry.catalog()` 导出（`GET /api/engine/workbench/schema.nodes`），
 *  类别驱动画布配色与详情渲染——UI 不硬编码节点语义（设计稿 D1）。 */
export interface WorkbenchNodeCatalogItem {
  type: string;
  title: string;
  category: string;
}

export interface WorkbenchSchema {
  triggers: { name: string; title: string; phase: string }[];
  effects: { type: string; title: string; domain: string }[];
  domains: Record<string, string>;
  nodes: WorkbenchNodeCatalogItem[];
}
