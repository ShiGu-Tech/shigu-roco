/** 伤害计算。所有系数来自 data/rules.json 的 damageFormula，便于真机校准。
 *  对应 Python effects/damage.py。
 */

import { bundleTypeMultiplier, getWeatherDef } from "../data";
import type { Rng } from "../rng";
import { applyProfile, statWithProfile } from "../stats";
import type { ActiveSprite, DataBundle, Dict } from "../types";
import { asDict, toNum, toStr } from "../types";

export interface DamageResult {
  damage: number;
  crit: boolean;
  typeMult: number;
  stab: number;
  effective: number;
}

export interface ComputeDamageOptions {
  weatherId?: string | null;
  forceCrit?: boolean;
  extraMult?: number;
  rng: Rng;
}

/** 基础值（含养成）× (1 + 增益 + 减益)。 */
export function effectiveStat(bundle: DataBundle, spriteDef: Dict, active: ActiveSprite, stat: string): number {
  const base = statWithProfile(bundle.stats, spriteDef, active.profile, stat);
  const bonus = toNum(active.buffs[stat], 0) + toNum(active.debuffs[stat], 0);
  return base * (1 + bonus);
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
  if (power <= 0) return { damage: 0, crit: false, typeMult: 1, stab: 1, effective: 0 };

  const { rng } = options;
  const formula = asDict(bundle.rules.damageFormula);
  const level = toNum(formula.level, 50);
  const levelFactor = toNum(formula.levelFactor, 2);
  const powerScale = toNum(formula.powerScale, 1.0);
  const adScale = toNum(formula.attackDefScale, 1.0);
  const stabValue = toNum(formula.stab, 1.5);
  const critRate = toNum(formula.critRate, 0.0625);
  const critFactor = toNum(formula.critFactor, 1.5);
  const randRange = Array.isArray(formula.randomRange) ? (formula.randomRange as number[]) : [0.85, 1.0];

  const category = toStr(skill.category);
  let atk: number;
  let dfn: number;
  if (category === "Physical") {
    atk = effectiveStat(bundle, attackerDef, attacker, "atk");
    dfn = effectiveStat(bundle, defenderDef, defender, "defense");
  } else {
    atk = effectiveStat(bundle, attackerDef, attacker, "spatk");
    dfn = effectiveStat(bundle, defenderDef, defender, "spdef");
  }
  dfn = Math.max(dfn, 1.0);

  const base = ((levelFactor * level) / 5 + 2) * (power * powerScale) * ((atk / dfn) * adScale) / 50 + 2;

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

  const crit = options.forceCrit !== undefined ? options.forceCrit : rng.bool(critRate);
  const critMult = crit ? critFactor : 1.0;
  const randomMult = rng.uniform(toNum(randRange[0], 0.85), toNum(randRange[1], 1.0));
  const extraMult = options.extraMult ?? 1.0;

  const damage = Math.max(0, Math.floor(base * stab * typeMult * weatherMult * critMult * randomMult * extraMult));
  return { damage, crit, typeMult, stab, effective: damage };
}

/** 便捷：按档案重算 active 的 maxHp（供外部构造实例时使用）。 */
export function withProfile(bundle: DataBundle, spriteDef: Dict, active: ActiveSprite): ActiveSprite {
  applyProfile(bundle.stats, spriteDef, active, active.profile);
  return active;
}
