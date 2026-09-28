/** 养成资质换算：基础资质（race） × 性格 + 三维培养面板。
 *
 * 幅度与映射来自 data/stats.json，全部可校准（占位值标【待校准】）。
 * 只依赖 StatsData，前端（持有 catalog.stats）与引擎共用同一份换算。
 */

import type { ActiveSprite, Dict, NatureDef, StatsData, StatProfile, TrainingPanel } from "./types";
import { asDict, toNum, toStr } from "./types";

export const STAT_KEYS = ["hp", "atk", "defense", "spatk", "spdef", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

const DEFAULT_PANEL_STAT: Record<TrainingPanel, string> = {
  hp: "hp",
  atk: "atk",
  defense: "defense",
};

export function raceStat(spriteDef: Dict, stat: string): number {
  return toNum(asDict(spriteDef.race)[stat], 0);
}

export function findNature(stats: StatsData, natureId: string | null | undefined): NatureDef | undefined {
  if (!natureId) return undefined;
  return (stats.natures ?? []).find((n) => n.id === natureId);
}

export function natureMultiplier(stats: StatsData, profile: StatProfile | undefined, stat: string): number {
  const nature = findNature(stats, profile?.nature);
  if (!nature) return 1;
  const upFactor = toNum(nature.upFactor, 1.1);
  const downFactor = toNum(nature.downFactor, 0.9);
  if (nature.up === stat) return upFactor;
  if (nature.down === stat) return downFactor;
  return 1;
}

export function trainingBonus(stats: StatsData, profile: StatProfile | undefined, stat: string): number {
  const training = profile?.training;
  if (!training) return 0;
  const perPanel = asDict(asDict(stats.training).perPanel);
  let bonus = 0;
  for (const [panel, points] of Object.entries(training)) {
    const def = asDict(perPanel[panel]);
    const targetStat = toStr(def.stat, DEFAULT_PANEL_STAT[panel as TrainingPanel] ?? "");
    if (targetStat !== stat) continue;
    bonus += toNum(def.perPoint, 1) * toNum(points, 0);
  }
  return bonus;
}

/** 基础资质（race）× 性格 + 培养加成。 */
export function statWithProfile(stats: StatsData, spriteDef: Dict, profile: StatProfile | undefined, stat: string): number {
  const base = raceStat(spriteDef, stat) * natureMultiplier(stats, profile, stat);
  return base + trainingBonus(stats, profile, stat);
}

export function computeStats(stats: StatsData, spriteDef: Dict, profile?: StatProfile): Record<StatKey, number> {
  const out = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) out[key] = statWithProfile(stats, spriteDef, profile, key);
  return out;
}

/** 把养成档案套到运行时实例：重算 maxHp，并按原血量比例调整当前 hp。 */
export function applyProfile(stats: StatsData, spriteDef: Dict, active: ActiveSprite, profile?: StatProfile): void {
  const block = computeStats(stats, spriteDef, profile);
  const ratio = active.maxHp > 0 ? active.hp / active.maxHp : 1;
  active.profile = profile;
  active.maxHp = Math.max(1, Math.round(block.hp));
  active.hp = Math.max(0, Math.min(active.maxHp, Math.round(ratio * active.maxHp)));
}

/** 前端便捷：由 catalog.stats + 精灵 race 直接算最大生命。 */
export function maxHpFromRace(stats: StatsData, race: Dict, profile?: StatProfile): number {
  return Math.max(1, Math.round(statWithProfile(stats, { race }, profile, "hp")));
}
