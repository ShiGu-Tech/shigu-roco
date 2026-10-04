/** 固定伤害计算（洛克王国 60 级 PVP 口径）。
 *
 * 伤害 = floor( (攻 × 战时显示威力 × 37/41) ÷ 防 ) × 减伤 × 连击
 * 攻/防为面板真实数值（不含 buff）；buff 通过「强化差值」进入战时显示威力。
 * 所有系数来自 data/*.json，便于真机校准。
 */

import { bundleTypeMultiplier, getWeatherDef } from "../data";
import { applyProfile, statWithProfile } from "../stats";
import type { ActiveSprite, DataBundle, Dict } from "../types";
import { asDict, toNum, toStr } from "../types";
import { evaluateFormula, resolveFormula } from "./formula";

export interface DamageResult {
  damage: number;
  typeMult: number;
  stab: number;
  effective: number;
  /** 明细：攻/防、战时威力与各倍率，便于 UI 展示与回归测试。 */
  breakdown: Record<string, number>;
}

export interface ComputeDamageOptions {
  weatherId?: string | null;
  /** 其他倍率（招式附加等），默认 1。 */
  extraMult?: number;
  /** 攻方特性倍率（默认 1）。 */
  attackerTraitMult?: number;
  /** 防方特性倍率（默认 1）。 */
  defenderTraitMult?: number;
  /** 减伤百分比 0~99。 */
  damageReduction?: number;
  /** 连击段数，默认 1。 */
  hits?: number;
}

/** 基础值（含养成）× (1 + 增益 + 减益) + 永久平铺加成（`counters.flat-<stat>`）。
 *  用于速度 / 展示（buff 为分数，一层 = 0.1）；`flat-speed` 供「示弱」等永久速度。 */
export function effectiveStat(bundle: DataBundle, spriteDef: Dict, active: ActiveSprite, stat: string): number {
  const base = statWithProfile(bundle.stats, spriteDef, active.profile, stat);
  const bonus = toNum(active.buffs[stat], 0) + toNum(active.debuffs[stat], 0);
  const flat = toNum(active.counters?.[`flat-${stat}`], 0);
  const pct = toNum(active.counters?.[`pct-${stat}`], 0);
  return base * (1 + bonus + pct) + flat;
}

/** 强化差值 = 1 + 攻方层 − 防方层（层以分数存于 buffs/debuffs，一层 = 0.1）。 */
function stageMultiplier(attacker: ActiveSprite, defender: ActiveSprite, atkStat: string, defStat: string): number {
  const atkStage = toNum(attacker.buffs[atkStat], 0) + toNum(attacker.debuffs[atkStat], 0);
  const defStage = toNum(defender.buffs[defStat], 0) + toNum(defender.debuffs[defStat], 0);
  return 1 + atkStage - defStage;
}

export function computeDamage(
  bundle: DataBundle,
  attackerDef: Dict,
  defenderDef: Dict,
  attacker: ActiveSprite,
  defender: ActiveSprite,
  skill: Dict,
  options: ComputeDamageOptions,
): DamageResult {
  const power = toNum(skill.power, 0);
  if (power <= 0) return { damage: 0, typeMult: 1, stab: 1, effective: 0, breakdown: {} };

  const category = toStr(skill.category);
  const formula = asDict(bundle.rules.damageFormula);
  const balance = toNum(formula.balance, 37 / 41);
  const stabValue = toNum(formula.stab, 1.25);

  const magical = category === "Magic";
  const atkStat = magical ? "spatk" : "atk";
  const defStat = magical ? "spdef" : "defense";
  const atk = statWithProfile(bundle.stats, attackerDef, attacker.profile, atkStat);
  const dfn = Math.max(1, statWithProfile(bundle.stats, defenderDef, defender.profile, defStat));

  const element = toStr(skill.element);
  const attackerElements = (attackerDef.elements as string[] | undefined) ?? [];
  const defenderElements = (defenderDef.elements as string[] | undefined) ?? [];
  const stab = attackerElements.includes(element) ? stabValue : 1.0;
  const typeMult = bundleTypeMultiplier(bundle, element, defenderElements);

  let weatherMult = 1.0;
  if (options.weatherId) {
    const damageMod = asDict(getWeatherDef(bundle, options.weatherId).damageMod);
    weatherMult = toNum(damageMod[element], 1.0);
  }

  const stageMult = stageMultiplier(attacker, defender, atkStat, defStat);
  const traitMult = (options.attackerTraitMult ?? 1) * (options.defenderTraitMult ?? 1);
  const extraMult = options.extraMult ?? 1.0;
  const hits = Math.max(1, Math.floor(options.hits ?? 1));

  const cap = toNum(asDict(bundle.rules.combat).damageReductionCap, 99);
  const reductionPct = Math.max(0, Math.min(cap, options.damageReduction ?? 0));
  const reduction = 1 - reductionPct / 100;

  // 公式数据化：spec 来自 `rules.formula`（缺省回退 `DEFAULT_FORMULA`），执行 / 预览共用求值器。
  const spec = resolveFormula(bundle.rules as Record<string, unknown>);
  const { value, vars } = evaluateFormula(spec, { power, atk, dfn, typeMult, stab, stageMult, traitMult, weatherMult, extraMult, reduction, hits, balance });

  const damage = Math.max(0, Math.floor(value));
  return {
    damage,
    typeMult,
    stab,
    effective: damage,
    breakdown: {
      atk,
      dfn,
      effectivePower: toNum(vars.effectivePower, 0),
      perHit: toNum(vars.perHit, 0),
      stageMult,
      stab,
      typeMult,
      traitMult,
      weatherMult,
      extraMult,
      reduction,
      hits,
    },
  };
}

/** 便捷：按档案重算 active 的 maxHp（供外部构造实例时使用）。 */
export function withProfile(bundle: DataBundle, spriteDef: Dict, active: ActiveSprite): ActiveSprite {
  applyProfile(bundle.stats, spriteDef, active, active.profile);
  return active;
}
