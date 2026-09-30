/** 精灵养成配置（我方已知 / 对方未知）：等级 / 星级 / 性格 / 三维加点 / 出战技能。
 *
 * 供对战台、弹窗式配置组件与阵容库共用；换算统一走 `engine/stats`（个体 = 天分 ×(1+星级)）。
 */

import { STAT_KEYS, type StatKey } from "@/modules/engine/stats";
import type { StatProfile } from "@/modules/engine/types";

/** 天分表：各属性 1~10（未填 = 未知 / 不加点）。 */
export type TalentMap = Partial<Record<StatKey, number>>;

/** 单只精灵的养成配置。 */
export interface PetSetup {
  level: number;
  stars: number;
  nature: string | null;
  talent: TalentMap;
  /** 出战 4 招；空数组 = 尚未确定（对方技能未知）。 */
  skills: string[];
}

/** 队伍条目：只给 spriteId = 资质未知；带 setup = 已明确；skillsUnknown = 技能未知。 */
export interface TeamEntry {
  spriteId: string;
  setup?: PetSetup;
  skillsUnknown?: boolean;
  /** 关联的精灵仓库实例 id（套用仓库时写入；引擎不消费，仅 UI 记忆来源）。 */
  instanceId?: string;
}

export const DEFAULT_LEVEL = 60;
export const DEFAULT_STARS = 5;
/** 三维：最多可加点的项数（与 data/stats.json `individual.investCount` 一致）。 */
export const MAX_INVEST = 3;
export const MAX_TALENT = 10;

export function emptySetup(): PetSetup {
  return { level: DEFAULT_LEVEL, stars: DEFAULT_STARS, nature: null, talent: {}, skills: [] };
}

/** 对方未知资质的占位：中性性格 · 5★ · 60 级（天分按 0 计）。 */
export function neutralSetup(): PetSetup {
  return emptySetup();
}

/** 养成配置 → 引擎档案：个体值 = 天分 × (1 + 星级)。 */
export function profileFromSetup(setup?: PetSetup): StatProfile | undefined {
  if (!setup) return undefined;
  const stars = Math.max(0, Math.floor(setup.stars));
  const iv: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    const talent = setup.talent[key];
    if (talent != null) iv[key] = Math.round(talent * (1 + stars));
  }
  return { level: setup.level, stars, nature: setup.nature ?? null, iv };
}
