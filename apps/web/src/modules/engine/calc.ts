/** 便捷计算器：面板 / 个体 / 伤害的纯函数工具。
 *
 * 面向「已知种族 + 少量养成条件，快速推面板 / 伤害」的场景（校准、反推、写脚本）。
 * 不依赖运行时 bundle：`stats` 缺省即用内置系数（与 data/stats.json 默认口径一致）。
 * 权威公式落点：面板 = stats.ts、伤害 = effects/damage.ts；本文件只做薄封装与反解，
 * 系数 / 魔法数字不在本文件新增（伤害系数仍在校准，故允许调用方覆盖）。
 */

import { type StatKey, computeStats, statCoefficients, statWithProfile } from "./stats";
import type { StatsData, StatProfile } from "./types";
import { asDict, toNum } from "./types";

/** 面板展示顺序：生命 / 物攻 / 魔攻 / 物防 / 魔防 / 速度。 */
export const PANEL_ORDER = ["hp", "atk", "spatk", "defense", "spdef", "speed"] as const satisfies readonly StatKey[];

export const STAT_LABEL: Record<StatKey, string> = {
  hp: "生命",
  atk: "物攻",
  spatk: "魔攻",
  defense: "物防",
  spdef: "魔防",
  speed: "速度",
};

/** 种族六项（只填用到的即可）。 */
export type Race = Partial<Record<StatKey, number>>;

/** 养成条件：等级 / 性格 / 个体 / 星级。 */
export interface Training {
  /** 等级；缺省用 stats.level.default（内置 60）。 */
  level?: number;
  /** 性格 id（见 data/stats.json.natures）。 */
  nature?: string | null;
  /** 性格正向项；与 natureDown 一起用时绕过 natures 表，直接按 ×1.10 / ×0.90（正向再随星级 +0.02/星）。 */
  natureUp?: StatKey;
  /** 性格负向项。 */
  natureDown?: StatKey;
  /** 个体值（天分 × 星级系数），按 stat key，各 0~60。 */
  iv?: Record<string, number>;
  /** 星级 0~5；影响：① 性格正向系数 = 1.10 + 0.02×星级；② 叠加 starBonus（生命 +20/星、其他 +10/星）。 */
  stars?: number;
}

// ---------------------------------------------------------------- 面板

function resolveNature(stats: StatsData, training: Training): { stats: StatsData; nature: string | null } {
  const up = training.natureUp ?? null;
  const down = training.natureDown ?? null;
  if (!up && !down) return { stats, nature: training.nature ?? null };
  const natures = [...(stats.natures ?? [])];
  const found = natures.find((n) => (n.up ?? null) === up && (n.down ?? null) === down);
  const chosen = found ?? { id: `__calc__${up ?? "none"}_${down ?? "none"}`, name: "自定义", up, down, upFactor: 1.1, downFactor: 0.9 };
  if (!found) natures.push(chosen);
  return { stats: { ...stats, natures }, nature: chosen.id };
}

function profileOf(training: Training, nature: string | null): StatProfile {
  return { level: training.level, nature, iv: training.iv, stars: training.stars };
}

/** 星级加成：生命 +20/星、其他五项 +10/星（0★=0，5★=+100/+50）；转发自 stats.ts，与面板换算同一实现。 */
export { starBonusOf } from "./stats";

/** 个体值 = 天分（1~10）× 星级系数（1★=×2 … 5★=×6），上限 maxPerStat（默认 60）。 */
export function ivFromTalent(talent: number, stars = 0, stats: StatsData = {}): number {
  const individual = asDict(stats.individual);
  const starMax = toNum(individual.starMax, 5);
  const maxPerStat = toNum(individual.maxPerStat, 60);
  const s = Math.max(0, Math.min(starMax, Math.floor(stars)));
  return Math.min(maxPerStat, talent * (1 + s));
}

/** 单项面板 = 括号先取整 → 乘性格（1.10+0.02×星级）→ 再取整 → 加星级常数。 */
export function statOf(race: Race, stat: StatKey, training: Training = {}, stats: StatsData = {}): number {
  const { stats: resolved, nature } = resolveNature(stats, training);
  return statWithProfile(resolved, { race }, profileOf(training, nature), stat);
}

/** 六项面板（key 见 STAT_KEYS / PANEL_ORDER）。 */
export function panelOf(race: Race, training: Training = {}, stats: StatsData = {}): Record<StatKey, number> {
  const { stats: resolved, nature } = resolveNature(stats, training);
  return computeStats(resolved, { race }, profileOf(training, nature));
}

/** 每级提升（不含性格）：生命 = 1 + (2·种族 + 个体)/100，其他 = (种族 + 个体×0.5)/100。 */
export function perLevelGain(race: Race, stat: StatKey, iv = 0, stats: StatsData = {}): number {
  const c = statCoefficients(stats, stat);
  return c.levelBase + toNum(race[stat], 0) * c.raceSlope + iv * c.ivSlope;
}

/** 按「生命/物攻/魔攻/物防/魔防/速度」顺序拼面板字符串。 */
export function formatPanel(panel: Record<string, number>, opts: { separator?: string; labels?: boolean } = {}): string {
  const sep = opts.separator ?? " / ";
  return PANEL_ORDER.map((k) => (opts.labels ? `${STAT_LABEL[k]} ${panel[k]}` : String(panel[k]))).join(sep);
}

// ---------------------------------------------------------------- 伤害

/** 默认伤害系数（与 data/rules.json.damageFormula.balance 一致；伤害公式仍在校准，故可覆盖）。 */
export const DEFAULT_DAMAGE_BALANCE = 37 / 41;

export interface DamageFactors {
  /** 属性倍率（克制 / 抵抗）。 */
  typeMult?: number;
  /** 本系加成（默认招式表里 1.25）。 */
  stab?: number;
  /** 强化差值 = 1 + 攻方层 − 防方层。 */
  stage?: number;
  /** 特性倍率。 */
  trait?: number;
  /** 天气倍率。 */
  weather?: number;
  /** 其他倍率（招式附加等）。 */
  extra?: number;
}

/** 战时显示威力 = 招式威力 × 各倍率。 */
export function effectivePowerOf(power: number, factors: DamageFactors = {}): number {
  return (
    power *
    (factors.typeMult ?? 1) *
    (factors.stab ?? 1) *
    (factors.stage ?? 1) *
    (factors.trait ?? 1) *
    (factors.weather ?? 1) *
    (factors.extra ?? 1)
  );
}

export interface DamageInput extends DamageFactors {
  /** 攻击方面板值（魔法招用魔攻、物理招用物攻）。 */
  atk: number;
  /** 防守方面板值（魔法招用魔防、物理招用物防）。 */
  defense: number;
  /** 招式威力。 */
  power: number;
  /** 减伤百分比 0~99。 */
  reduction?: number;
  /** 连击段数，默认 1。 */
  hits?: number;
  /** 伤害系数，默认 DEFAULT_DAMAGE_BALANCE。 */
  balance?: number;
}

export interface DamageOutput {
  damage: number;
  perHit: number;
  effectivePower: number;
  breakdown: Record<string, number>;
}

/** 伤害 = floor( 攻 × 有效威力 × balance ÷ 防 ) × (1 − 减伤%) × 连击。 */
export function damageOf(input: DamageInput): DamageOutput {
  const balance = input.balance ?? DEFAULT_DAMAGE_BALANCE;
  const effectivePower = effectivePowerOf(input.power, input);
  const defense = Math.max(1, input.defense);
  const perHit = Math.floor((input.atk * effectivePower * balance) / defense);
  const reduction = 1 - Math.max(0, Math.min(99, input.reduction ?? 0)) / 100;
  const hits = Math.max(1, Math.floor(input.hits ?? 1));
  const damage = Math.max(0, Math.floor(perHit * reduction * hits));
  return {
    damage,
    perHit,
    effectivePower,
    breakdown: { atk: input.atk, defense, effectivePower, perHit, reduction, hits, balance },
  };
}

// ---------------------------------------------------------------- 反解（校准用）

export interface DamageSample {
  /** 实测伤害。 */
  damage: number;
  /** 攻击方面板值。 */
  atk: number;
  /** 有效威力（已乘倍率）。 */
  effectivePower: number;
}

/** 反推伤害系数：取所有样本 `floor(攻×威力×b÷防) = 伤害` 成立区间的交集。 */
export function balanceRange(samples: (DamageSample & { defense: number })[]): [number, number] {
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  for (const s of samples) {
    const k = s.atk * s.effectivePower;
    if (k <= 0) continue;
    lo = Math.max(lo, (s.damage * s.defense) / k);
    hi = Math.min(hi, ((s.damage + 1) * s.defense) / k);
  }
  return [lo, hi];
}

/** 反推防御：取所有样本 `floor(攻×威力×b÷防) = 伤害` 成立时「防」区间的交集。 */
export function defenseRange(samples: DamageSample[], balance = DEFAULT_DAMAGE_BALANCE): [number, number] {
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  for (const s of samples) {
    const k = s.atk * s.effectivePower * balance;
    if (s.damage <= 0) {
      lo = Math.max(lo, k);
      continue;
    }
    lo = Math.max(lo, k / (s.damage + 1));
    hi = Math.min(hi, k / s.damage);
  }
  return [lo, hi];
}
