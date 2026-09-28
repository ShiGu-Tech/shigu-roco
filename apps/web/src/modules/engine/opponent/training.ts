/** 对手养成度后验：养成档位上的 Dirichlet–Multinomial。
 *
 * 对手养成是隐藏信息：先验来自 data/stats.json.trainingProfiles，
 * 观测（最大生命 / 伤害）按高斯似然加权更新后验；MCTS rollout 内按后验采样档位。
 * 幅度与似然带宽均【待校准】。
 */

import { getSprite } from "../data";
import type { Rng } from "../rng";
import { computeStats } from "../stats";
import type { DataBundle, Dict, StatProfile, TrainingProfileDef } from "../types";
import { toNum } from "../types";

export const DEFAULT_TRAINING_PROFILES: TrainingProfileDef[] = [
  { id: "none", label: "无个体", prior: 1, iv: {} },
  { id: "half", label: "半个体", prior: 1, iv: { hp: 30, atk: 30, spatk: 30, defense: 30, spdef: 30, speed: 30 } },
  { id: "full", label: "满个体", prior: 1, iv: { hp: 60, atk: 60, speed: 60 } },
];

export function profileOptions(bundle: DataBundle): TrainingProfileDef[] {
  const opts = bundle.stats.trainingProfiles?.options;
  return opts && opts.length ? opts : DEFAULT_TRAINING_PROFILES;
}

export function priorOf(profiles: TrainingProfileDef[]): number[] {
  return profiles.map((p) => Math.max(0, toNum(p.prior, 1)));
}

export function profileToStatProfile(p: TrainingProfileDef): StatProfile {
  return { nature: p.nature ?? null, iv: { ...(p.iv ?? {}) } };
}

/** 后验期望 P(profile) = (α + n) / (Σα + n)。 */
export function trainingProbabilities(profiles: TrainingProfileDef[], counts: number[], alpha?: number[]): number[] {
  const a = alpha ?? priorOf(profiles);
  const totals = profiles.map((_, i) => Math.max(0, a[i] ?? 1) + Math.max(0, counts[i] ?? 0));
  const sum = totals.reduce((s, v) => s + v, 0) || 1;
  return totals.map((t) => t / sum);
}

export function sampleTrainingProfile(
  rng: Rng,
  profiles: TrainingProfileDef[],
  counts: number[],
  alpha?: number[],
): TrainingProfileDef {
  const probs = trainingProbabilities(profiles, counts, alpha);
  return rng.weightedPick(profiles, probs);
}

/** 用一组似然（与 profiles 同序）加权更新计数。 */
export function updateTrainingCounts(counts: number[], likelihoods: number[], strength = 1): void {
  likelihoods.forEach((l, i) => {
    counts[i] = Math.max(0, (counts[i] ?? 0) + strength * Math.max(0, l));
  });
}

/** 由观测最大生命得到各档位似然（高斯，带宽默认 5%）。【待校准】 */
export function maxHpLikelihood(
  bundle: DataBundle,
  spriteId: string,
  observedMaxHp: number,
  profiles: TrainingProfileDef[],
  sigmaRatio = 0.05,
): number[] {
  const spriteDef = getSprite(bundle, spriteId);
  const sigma = Math.max(1, observedMaxHp * sigmaRatio);
  return profiles.map((p) => {
    const predicted = computeStats(bundle.stats, spriteDef, profileToStatProfile(p)).hp;
    const z = (predicted - observedMaxHp) / sigma;
    return Math.exp(-0.5 * z * z);
  });
}

/** 由一次伤害观测得到各档位似然（守方防御相关）。【待校准，MVP 占位】 */
export function damageLikelihood(
  bundle: DataBundle,
  spriteId: string,
  observedDamage: number,
  predictedDamage: (profile: StatProfile) => number,
  profiles: TrainingProfileDef[],
  sigmaRatio = 0.1,
): number[] {
  const sigma = Math.max(1, observedDamage * sigmaRatio);
  return profiles.map((p) => {
    const predicted = predictedDamage(profileToStatProfile(p));
    const z = (predicted - observedDamage) / sigma;
    return Math.exp(-0.5 * z * z);
  });
}

export function asDictStats(bundle: DataBundle): Dict {
  return (bundle.stats ?? {}) as Dict;
}
