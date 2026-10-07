/** 对方 / 我方资质反推（纯函数，双方通用）。
 *
 * 只吃「可观测事实」：伤害 / 本次掉血% / 先后手。
 * 星级 / 等级固定 **5★ · 60 级**（本稿约束）；推 **性格 + 天分**，先按「推荐加点（3 项满 +10）」
 * 收敛，未命中再放宽到「任意 ≤3 项、0~10」。全部走 `engine/calc.ts` 的 `inferDefense` /
 * `inferMaxHpRange` / `inferBuild`，不新增引擎能力。设计见《精灵试验台-设计-v0.1》。
 *
 * 容差与放宽：真实伤害还受天气 / 特性 / 减伤 / 连击 / 暴击等未计入倍率影响，故对区间加容差，
 * 且无解时**逐步放宽拟合**而非直接判「矛盾」——只有区间真的倒挂才报矛盾。
 */

import { PANEL_ORDER, STAT_LABEL, inferBuild, inferDefense, inferMaxHpRange, type InferredBuild } from "@/modules/engine/calc";
import { typeMultiplier } from "@/modules/engine/data";
import { computeStats, type StatKey } from "@/modules/engine/stats";
import type { ActiveSpriteState, Catalog, CatalogSkill, CatalogSprite } from "@/modules/battle/types";

import type { BestBuild, InferResult, NatureCandidate, Observation, TalentCandidate, TalentMap } from "./types";

const FIXED_LEVEL = 60;
const FIXED_STARS = 5;
/** 伤害观测容差（floor / 未计入倍率的综合误差）。 */
const HIT_TOLERANCE = 0.08;
/** 本次掉血整数显示带来的容差。 */
const HP_TOLERANCE = 0.03;

type Range = [number, number];

function intersect(a: Range | undefined, b: Range): Range {
  if (!a) return b;
  return [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
}

function widen([lo, hi]: Range, pct: number): Range {
  return [Math.max(0, lo * (1 - pct)), Number.isFinite(hi) ? hi * (1 + pct) : hi];
}

function natureKey(up: string | null, down: string | null): string {
  return `${up ?? "none"}_${down ?? "none"}`;
}

function natureMeta(catalog: Catalog, up: string | null, down: string | null): { id: string; name: string } {
  const found = (catalog.stats?.natures ?? []).find((n) => (n.up ?? null) === up && (n.down ?? null) === down);
  if (found) return { id: found.id, name: found.nameZh ?? found.name ?? found.id };
  if (!up && !down) return { id: "neutral", name: "中性" };
  const label = (k: string | null, sign: string) => (k ? `${STAT_LABEL[k as StatKey] ?? k}${sign}` : "");
  return { id: natureKey(up, down), name: `${label(up, "↑")}${label(down, "↓")}`.trim() || "自定义" };
}

/** 由一次伤害观测得到的守方防御区间（攻方为对侧 active）。
 *
 * 若观测带 `engineDamage`（引擎同配置跑出的守方受击伤害，已计入特性 / 减伤 / 天气），
 * 则用「伤害 ∝ 1/防御」直接校正：目标防御 = 当前防御 × 引擎伤害 / 实测伤害。这样减伤不再被
 * 误算成防御（否则闭式会把减伤折算成虚高防御）。无 `engineDamage` 时才退回闭式（仅兜底）。 */
function defenseRangeOf(
  catalog: Catalog,
  skill: CatalogSkill,
  selfSprite: CatalogSprite,
  selfActive: ActiveSpriteState,
  oppSprite: CatalogSprite,
  oppActive: ActiveSpriteState,
  damage: number,
  engineDamage?: number,
): { range?: Range; engineTarget?: number } {
  const magical = skill.category === "Magic";
  const atkStat: StatKey = magical ? "spatk" : "atk";
  const defStat: StatKey = magical ? "spdef" : "defense";
  if (engineDamage && engineDamage > 0 && damage > 0) {
    const curDef = computeStats(catalog.stats ?? {}, { race: oppSprite.race }, oppActive.profile)[defStat];
    const est = (curDef * engineDamage) / damage;
    return { range: [est, est], engineTarget: est };
  }
  const panel = computeStats(catalog.stats ?? {}, { race: selfSprite.race }, selfActive.profile);
  // 有效攻 = 面板 ×（1 + 增益 + 减益）+ 平铺/百分比计数器（与引擎 `effectiveStat` 同口径）。
  const bonus = (selfActive.buffs?.[atkStat] ?? 0) + (selfActive.debuffs?.[atkStat] ?? 0);
  const flat = selfActive.counters?.[`flat-${atkStat}`] ?? 0;
  const pct = selfActive.counters?.[`pct-${atkStat}`] ?? 0;
  const attackerAtk = panel[atkStat] * (1 + bonus + pct) + flat;
  const elements = {
    matrix: catalog.elementMatrix ?? {},
    values: catalog.elementValues ?? {},
    combine: catalog.elementCombine ?? {},
  };
  const typeMult = typeMultiplier(elements, skill.element, oppSprite.elements);
  const stab = selfSprite.elements.includes(skill.element) ? 1.25 : 1;
  const atkStage = (selfActive.buffs?.[atkStat] ?? 0) + (selfActive.debuffs?.[atkStat] ?? 0);
  const defStage = (oppActive.buffs?.[defStat] ?? 0) + (oppActive.debuffs?.[defStat] ?? 0);
  const stage = 1 + atkStage - defStage;
  return { range: inferDefense({ damage, attackerAtk, power: skill.power, typeMult, stab, stage }).defense };
}

export interface InferInput {
  catalog: Catalog;
  oppSprite: CatalogSprite;
  oppActive: ActiveSpriteState;
  selfSprite?: CatalogSprite;
  selfActive?: ActiveSpriteState;
  observations: Observation[];
}

/** 由观测集合反推某侧性格 + 天分（固定 5★·60）。 */
export function inferOpponent(input: InferInput): InferResult {
  const { catalog, oppSprite, oppActive, selfSprite, selfActive, observations } = input;
  const empty: InferResult = {
    nature: [],
    talent: [],
    sampleCount: 0,
    candidateCount: 0,
    recommended: false,
    approximate: false,
    conflict: false,
    notes: [],
  };

  let defense: Range | undefined;
  let maxHp: Range | undefined;
  let speed: Range | undefined;
  let samples = 0;
  let mismatched = false;
  /** 最近一次伤害观测的实测值（用于「最吻合组合」的预测伤害）。 */
  let repObserved = 0;
  /** 引擎校正后的目标防御（每个伤害观测一个）。 */
  const engineTargets: number[] = [];
  const notes: string[] = [];

  for (const obs of observations) {
    if (obs.kind === "damage" && obs.damage && obs.damage > 0) {
      samples += 1;
      repObserved = obs.damage;
      const corrected = Boolean(obs.engineDamage && obs.engineDamage > 0);
      // 受击方在防御 / 应对（含防御类技能）：伤害被减伤。跑过引擎校正则已计入；否则闭式会把减伤折算成虚高防御。
      const defSkill = obs.defenderAction && obs.defenderAction !== "defend" && obs.defenderAction !== "counter"
        ? catalog.allSkills.find((s) => s.id === obs.defenderAction)
        : undefined;
      const defended =
        obs.defenderAction === "defend" ||
        obs.defenderAction === "counter" ||
        Boolean(defSkill && (defSkill.category === "Defense" || defSkill.actionType === "Defense"));
      if (defended && !corrected) {
        mismatched = true;
        const dn = defSkill ? `「${defSkill.name}」` : "防御 / 应对";
        notes.push(`受击方用了 ${dn}，本例尚未引擎校正：点该行「引擎预览」后会按实际减伤重算`);
      }
      // 本次掉血%（与历史无关）：maxHp = 伤害 / 掉血比例；整数显示 ±0.5 由 inferMaxHpRange 处理。
      const dropPct = obs.dropPct ?? (obs.remainPct != null ? 100 - obs.remainPct : undefined);
      if (dropPct != null && dropPct > 0.5) {
        maxHp = intersect(maxHp, widen(inferMaxHpRange(obs.damage, 100 - dropPct), HP_TOLERANCE));
      }
      const skill = obs.attackerSkillId ? catalog.allSkills.find((s) => s.id === obs.attackerSkillId) : undefined;
      if (skill && selfSprite && selfActive && skill.power > 0) {
        const { range, engineTarget } = defenseRangeOf(catalog, skill, selfSprite, selfActive, oppSprite, oppActive, obs.damage, obs.engineDamage);
        if (range) defense = intersect(defense, widen(range, HIT_TOLERANCE));
        if (engineTarget) {
          engineTargets.push(engineTarget);
          if (defended) notes.push(`已按引擎计入受击方${defSkill ? `「${defSkill.name}」` : ""}的减伤 / 特性`);
        }
      }
    } else if (obs.kind === "speed" && obs.speedFirst && selfSprite && selfActive) {
      samples += 1;
      const selfSpeed = computeStats(catalog.stats ?? {}, { race: selfSprite.race }, selfActive.profile).speed;
      speed = obs.speedFirst === "opp" ? intersect(speed, [selfSpeed, Number.POSITIVE_INFINITY]) : intersect(speed, [0, selfSpeed]);
    }
  }

  const conflict = Boolean((defense && defense[0] > defense[1]) || (maxHp && maxHp[0] > maxHp[1]) || (speed && speed[0] > speed[1]));
  const baseTarget: Record<string, Range> = {
    ...(defense && !conflict ? { defense } : {}),
    ...(maxHp && !conflict ? { hp: maxHp } : {}),
    ...(speed && !conflict ? { speed } : {}),
  };
  if (!Object.keys(baseTarget).length || conflict) {
    return { ...empty, defense, maxHp, speed, sampleCount: samples, conflict };
  }

  // 先严格拟合；无解则逐步放宽区间（吸收未计入倍率 / 误差），仍无解才判「无匹配」。
  let builds: InferredBuild[] = [];
  let relaxed = 0;
  for (; relaxed <= 4 && builds.length === 0; relaxed++) {
    const factor = relaxed === 0 ? 1 : 1 + 0.15 * relaxed;
    const target = relaxed === 0
      ? baseTarget
      : Object.fromEntries(Object.entries(baseTarget).map(([k, [lo, hi]]) => [k, [lo / factor, Number.isFinite(hi) ? hi * factor : hi]]));
    builds = inferBuild(oppSprite.race, target, { level: FIXED_LEVEL, stars: [FIXED_STARS], stats: catalog.stats });
  }
  if (!builds.length) {
    return {
      ...empty,
      defense,
      maxHp,
      speed,
      sampleCount: samples,
      approximate: true,
      conflict: false,
      notes: [...notes, "该精灵在 5★·60 下无法达到此防御 / 血量区间（可能有未计入的增益 / 特性 / 减伤）"],
    };
  }

  const constrained = PANEL_ORDER.filter((k) => baseTarget[k]);
  const investedOf = (b: InferredBuild) => constrained.filter((k) => (b.talent[k] ?? 0) > 0).length;
  // 推荐加点：只在被约束项里出现 0 或满 +10，且总投放 ≤3 项。
  const recommendedBuilds = builds.filter(
    (b) =>
      investedOf(b) <= 3 &&
      constrained.every((k) => {
        const t = b.talent[k] ?? 0;
        return t === 0 || t === 10;
      }),
  );
  const pool = recommendedBuilds.length ? recommendedBuilds : builds.filter((b) => investedOf(b) <= 3);
  const finalPool = pool.length ? pool : builds;
  const recommended = recommendedBuilds.length > 0;

  // 「最吻合组合」：在收敛池里按与引擎校正目标防御的接近度排序（预测伤害 = 实测 × 目标防御 / 该组合防御）。
  let best: BestBuild[] | undefined;
  if (defense && finalPool.length) {
    const center = (defense[0] + defense[1]) / 2;
    const seen = new Set<string>();
    const ranked: BestBuild[] = [];
    for (const b of finalPool) {
      const talent: TalentMap = {};
      for (const k of constrained) talent[k] = b.talent[k] ?? 0;
      const d = b.panel.defense;
      const error = center > 0 ? Math.abs(d - center) / center : 0;
      const key = `${b.nature.up ?? "-"}|${b.nature.down ?? "-"}|${JSON.stringify(talent)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({
        nature: { up: b.nature.up, down: b.nature.down, name: natureMeta(catalog, b.nature.up, b.nature.down).name },
        talent,
        panel: b.panel as Record<string, number>,
        predictedDamage: repObserved > 0 && d > 0 ? Math.round((repObserved * center) / d) : 0,
        error,
      });
    }
    ranked.sort((a, b) => a.error - b.error);
    best = ranked.slice(0, 5);
  }

  // 边际概率：命中候选均匀加权。
  const natureCount = new Map<string, { up: string | null; down: string | null; count: number }>();
  const talentCount = new Map<string, { talent: TalentMap; count: number }>();
  for (const b of finalPool) {
    const nk = natureKey(b.nature.up, b.nature.down);
    const cur = natureCount.get(nk);
    if (cur) cur.count += 1;
    else natureCount.set(nk, { up: b.nature.up, down: b.nature.down, count: 1 });
    const tk: TalentMap = {};
    for (const k of constrained) tk[k] = b.talent[k] ?? 0;
    const key = JSON.stringify(tk);
    const tc = talentCount.get(key);
    if (tc) tc.count += 1;
    else talentCount.set(key, { talent: tk, count: 1 });
  }

  const total = finalPool.length;
  const nature: NatureCandidate[] = [...natureCount.values()]
    .map(({ up, down, count }) => {
      const meta = natureMeta(catalog, up, down);
      return { id: meta.id, up, down, name: meta.name, p: count / total };
    })
    .sort((a, b) => b.p - a.p);
  const talent: TalentCandidate[] = [...talentCount.values()]
    .map(({ talent: t, count }) => ({ talent: t, p: count / total }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 6);

  return {
    nature,
    talent,
    defense,
    maxHp,
    speed,
    sampleCount: samples,
    candidateCount: total,
    recommended,
    approximate: relaxed > 1 || mismatched,
    conflict: false,
    notes,
    best,
  };
}
