/** 面板真实数值换算（洛克王国世界 · 实测等级公式）。
 *
 * panel(L) = round( 性格 × round( base + 种族×raceBase + 个体×ivBase
 *                                  + (levelBase + 种族×raceSlope + 个体×ivSlope)×L ) )
 *   · 攻/防/速：10 + (种族 + 个体×0.5)×(L+50)/100 的等价展开（levelBase = 0）。
 *   · 生命：10 + 0.5·种族 + 0.25·个体 + (1 + 0.02·种族 + 0.01·个体)·L（L60 = 种族×1.7 + 个体×0.85 + 70）。
 * 系数见 data/stats.json.panels；性格正向 = 1.10 + 0.02×星级（0★=1.10 … 5★=1.20）、负向固定 ×0.9、中性 ×1.0；
 * 括号先取整再乘性格；星级常数（生命 +20/星、其他 +10/星）另算、不受性格影响。
 * 只依赖 StatsData，前端（持有 catalog.stats）与引擎共用同一份换算。
 */

import type { ActiveSprite, Dict, NatureDef, StatsData, StatProfile } from "./types";
import { asDict, toNum } from "./types";

export const STAT_KEYS = ["hp", "atk", "defense", "spatk", "spdef", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

const DEFAULT_PANEL = { base: 10, raceBase: 0.5, ivBase: 0.25, levelBase: 0, raceSlope: 0.01, ivSlope: 0.005 };
const DEFAULT_HP_PANEL = { base: 10, raceBase: 0.5, ivBase: 0.25, levelBase: 1, raceSlope: 0.02, ivSlope: 0.01 };

/** 面板 6 系数（缺省用内置默认，与 data/stats.json.panels 一致）。 */
export function statCoefficients(stats: StatsData, stat: string) {
  const panels = asDict((stats as Dict).panels);
  const fallback = stat === "hp" ? DEFAULT_HP_PANEL : DEFAULT_PANEL;
  const def = asDict(panels[stat === "hp" ? "hp" : "default"]);
  return {
    base: toNum(def.base, fallback.base),
    raceBase: toNum(def.raceBase, fallback.raceBase),
    ivBase: toNum(def.ivBase, fallback.ivBase),
    levelBase: toNum(def.levelBase, fallback.levelBase),
    raceSlope: toNum(def.raceSlope, fallback.raceSlope),
    ivSlope: toNum(def.ivSlope, fallback.ivSlope),
  };
}

/** 换算用等级：优先 profile.level，其次 stats.level.default（缺省 60）。 */
function levelOf(stats: StatsData, profile: StatProfile | undefined): number {
  const level = toNum(profile?.level, NaN);
  if (Number.isFinite(level)) return level;
  return toNum(asDict((stats as Dict).level).default, 60);
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

/** 性格倍率：正向 = upFactor + upPerStar×星级（0★=1.10 … 5★=1.20）；负向固定 0.9；其余 1.0。 */
export function natureMultiplier(stats: StatsData, profile: StatProfile | undefined, stat: string): number {
  const nature = findNature(stats, profile?.nature);
  if (!nature) return 1;
  if (nature.up === stat) {
    const scaling = asDict((stats as Dict).natureScaling);
    const perStar = toNum(scaling.upPerStar, 0.02);
    const starMax = toNum(scaling.starMax, 5);
    const stars = Math.max(0, Math.min(starMax, Math.floor(toNum(profile?.stars, 0))));
    return toNum(nature.upFactor, 1.1) + perStar * stars;
  }
  if (nature.down === stat) return toNum(nature.downFactor, 0.9);
  return 1;
}

/** 星级加成：生命 +20/星、其他五项 +10/星（0★=0，5★=+100/+50）；加在性格之后、不受性格影响。 */
export function starBonusOf(stats: StatsData, stat: string, stars: number): number {
  const block = asDict((stats as Dict).starBonus);
  const per = toNum(block[stat === "hp" ? "hp" : "default"], stat === "hp" ? 20 : 10);
  const starMax = toNum(block.starMax, 5);
  return per * Math.max(0, Math.min(starMax, Math.floor(stars)));
}

/** 面板真实数值：括号（种族 / 个体 / 等级项）先取整 → 乘性格 → 取整 → 加星级常数。 */
export function statWithProfile(stats: StatsData, spriteDef: Dict, profile: StatProfile | undefined, stat: string): number {
  const p = statCoefficients(stats, stat);
  const race = raceStat(spriteDef, stat);
  const iv = ivOf(profile, stat);
  const level = levelOf(stats, profile);
  const inner =
    p.base + race * p.raceBase + iv * p.ivBase + (p.levelBase + race * p.raceSlope + iv * p.ivSlope) * level;
  const nature = natureMultiplier(stats, profile, stat);
  return Math.round(Math.round(inner) * nature) + starBonusOf(stats, stat, toNum(profile?.stars, 0));
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
