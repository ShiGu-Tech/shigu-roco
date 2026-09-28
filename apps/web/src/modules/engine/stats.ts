/** 面板真实数值换算（洛克王国 60 级 PVP 口径）。
 *
 * 生命：round( round(种族×raceFactor + 个体×ivFactor + base) × 性格 ) + result
 * 其他：同上（default 面板）。
 * 系数与常数来自 data/stats.json.panels，全部可校准；等级 60 已折进系数。
 * 只依赖 StatsData，前端（持有 catalog.stats）与引擎共用同一份换算。
 */

import type { ActiveSprite, Dict, NatureDef, StatsData, StatProfile } from "./types";
import { asDict, toNum } from "./types";

export const STAT_KEYS = ["hp", "atk", "defense", "spatk", "spdef", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

const DEFAULT_PANEL = { raceFactor: 1.1, ivFactor: 0.55, base: 10, result: 50 };
const DEFAULT_HP_PANEL = { raceFactor: 1.7, ivFactor: 0.85, base: 70, result: 100 };

function panelDef(stats: StatsData, stat: string) {
  const panels = asDict((stats as Dict).panels);
  const fallback = stat === "hp" ? DEFAULT_HP_PANEL : DEFAULT_PANEL;
  const def = asDict(panels[stat === "hp" ? "hp" : "default"]);
  return {
    raceFactor: toNum(def.raceFactor, fallback.raceFactor),
    ivFactor: toNum(def.ivFactor, fallback.ivFactor),
    base: toNum(def.base, fallback.base),
    result: toNum(def.result, fallback.result),
  };
}

export function raceStat(spriteDef: Dict, stat: string): number {
  return toNum(asDict(spriteDef.race)[stat], 0);
}

/** 个体值（天分 × 星级系数），0~60。 */
export function ivOf(profile: StatProfile | undefined, stat: string): number {
  return toNum(asDict(profile?.iv)[stat], 0);
}

export function findNature(stats: StatsData, natureId: string | null | undefined): NatureDef | undefined {
  if (!natureId) return undefined;
  return (stats.natures ?? []).find((n) => n.id === natureId);
}

export function natureMultiplier(stats: StatsData, profile: StatProfile | undefined, stat: string): number {
  const nature = findNature(stats, profile?.nature);
  if (!nature) return 1;
  const upFactor = toNum(nature.upFactor, 1.2);
  const downFactor = toNum(nature.downFactor, 0.9);
  if (nature.up === stat) return upFactor;
  if (nature.down === stat) return downFactor;
  return 1;
}

/** 面板真实数值：性格只乘括号，末尾常数在舍入与性格之外。 */
export function statWithProfile(stats: StatsData, spriteDef: Dict, profile: StatProfile | undefined, stat: string): number {
  const p = panelDef(stats, stat);
  const inner = raceStat(spriteDef, stat) * p.raceFactor + ivOf(profile, stat) * p.ivFactor + p.base;
  const nature = natureMultiplier(stats, profile, stat);
  return Math.round(Math.round(inner) * nature) + p.result;
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
