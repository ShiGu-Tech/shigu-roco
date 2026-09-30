/** 加点自动推荐（机械策略 v1）。
 *
 * 先用参数 + 代码把规则固定下来，接口保持 `recommendTalent(catalog, instance)` 不变；
 * 后续由 AI 结合精灵技能池替换（换的是打分来源，不是调用点）。
 *
 * 策略 = 逐项记分（性格导向的角色模板 + 阈值规则 + 种族值占位）→ 取前 `investCount` 项 → 每项拉满天分。
 * 阈值落 `data/stats.json.talentRecommend`（缺省用内置默认，与 `statCoefficients` 同风格）。
 */

import { STAT_KEYS, type StatKey } from "../engine/stats";
import { toNum } from "../engine/types";
import type { Catalog } from "../battle/types";
import type { TalentMap } from "./instance";

export interface TalentRecommendRules {
  speedThreshold: number;
  hpThreshold: number;
  attackThreshold: number;
}

/** 内置默认阈值（与 data/stats.json.talentRecommend 一致）。 */
const DEFAULT_RULES: TalentRecommendRules = { speedThreshold: 115, hpThreshold: 100, attackThreshold: 105 };

/** 被推荐项的天分取值：拉满（与前端滑条 MAX_TALENT 一致）。 */
export const RECOMMEND_TALENT_MAX = 10;

export function recommendRules(stats: Catalog["stats"]): TalentRecommendRules {
  const block = stats?.talentRecommend ?? {};
  return {
    speedThreshold: toNum(block.speedThreshold, DEFAULT_RULES.speedThreshold),
    hpThreshold: toNum(block.hpThreshold, DEFAULT_RULES.hpThreshold),
    attackThreshold: toNum(block.attackThreshold, DEFAULT_RULES.attackThreshold),
  };
}

export interface TalentRecommendation {
  /** 推荐加点的天分表（每项拉满）。 */
  talent: TalentMap;
  /** 推荐项目（按得分降序）。 */
  order: StatKey[];
  /** 逐项得分（调试 / 展示用）。 */
  scores: Record<StatKey, number>;
}

/** 较高攻击项（被性格削弱时取另一项），返回 [首选攻击, 次选攻击]。 */
function attackOrder(race: Partial<Record<StatKey, number>>, down: StatKey | null): [StatKey, StatKey] {
  const high: StatKey = toNum(race.atk, 0) >= toNum(race.spatk, 0) ? "atk" : "spatk";
  const low: StatKey = high === "atk" ? "spatk" : "atk";
  return down && high === down ? [low, high] : [high, low];
}

/** 性格正向决定的角色加点模板（优先序）。 */
function roleTemplate(up: StatKey, race: Partial<Record<StatKey, number>>, down: StatKey | null): StatKey[] {
  const [best, other] = attackOrder(race, down);
  switch (up) {
    case "speed":
      return ["speed", best, "hp", "defense", "spdef", other];
    case "hp":
      return ["hp", "defense", "spdef", best, other, "speed"];
    case "atk":
      return ["atk", "speed", "hp", "spdef", "defense", "spatk"];
    case "spatk":
      return ["spatk", "speed", "hp", "spdef", "defense", "atk"];
    case "defense":
      return ["defense", "hp", "spdef", best, other, "speed"];
    case "spdef":
      return ["spdef", "hp", "defense", best, other, "speed"];
    default:
      return [...STAT_KEYS];
  }
}

/** 中性性格（无 up）时的记分：阈值规则 + 种族值占位。 */
function neutralScores(
  race: Partial<Record<StatKey, number>>,
  down: StatKey | null,
  rules: TalentRecommendRules,
): Record<StatKey, number> {
  const [best] = attackOrder(race, down);
  const scores = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    let score = 0;
    if (key === down) score -= 1000; // 性格削弱项一律排除
    if (key === "speed" && toNum(race.speed, 0) >= rules.speedThreshold) score += 60;
    if (key === "hp" && toNum(race.hp, 0) >= rules.hpThreshold) score += 60;
    if (key === best && toNum(race[key], 0) >= rules.attackThreshold) score += 50;
    score += toNum(race[key], 0) / 10; // 种族值占位：破平 + 无规则时兜底
    scores[key] = score;
  }
  return scores;
}

/** 同分时的固定优先序：生命 / 速度 / 物攻 / 魔攻 / 物防 / 魔防。 */
const TIE_ORDER: StatKey[] = ["hp", "speed", "atk", "spatk", "defense", "spdef"];

/** 机械推荐加点：需要当前模板（种族）+ 性格；星级不影响加点项，仅为签名完整保留。 */
export function recommendTalent(
  catalog: Catalog,
  instance: Pick<{ spriteId: string; stars: number; nature: string | null }, "spriteId" | "stars" | "nature">,
): TalentRecommendation {
  const sprite = catalog.sprites.find((s) => s.id === instance.spriteId);
  const race = (sprite?.race ?? {}) as Partial<Record<StatKey, number>>;
  const nature = (catalog.stats?.natures ?? []).find((n) => n.id === instance.nature);
  const up = (nature?.up ?? null) as StatKey | null;
  const down = (nature?.down ?? null) as StatKey | null;
  const rules = recommendRules(catalog.stats);
  const investCount = Math.max(1, Math.floor(toNum(catalog.stats?.individual?.investCount, 3)));

  const scores = neutralScores(race, down, rules);
  let order: StatKey[];
  if (up) {
    // 性格导向：按角色模板取序，排除被削弱项、去重
    const ranked = roleTemplate(up, race, down).filter((k) => k !== down);
    order = ranked.filter((k, i) => ranked.indexOf(k) === i);
  } else {
    order = [...STAT_KEYS].sort((a, b) =>
      scores[b] !== scores[a] ? scores[b] - scores[a] : TIE_ORDER.indexOf(a) - TIE_ORDER.indexOf(b),
    );
  }
  order = order.slice(0, investCount);

  const talent: TalentMap = {};
  for (const key of order) talent[key] = RECOMMEND_TALENT_MAX;
  return { talent, order, scores };
}

export interface NaturePick {
  id: string;
  up: StatKey;
  down: StatKey;
}

/** 按种族推荐性格：速攻向 +速度、慢攻向 +较高攻击、耐久向 +生命；下降项取没用的较弱攻击。 */
export function recommendNature(catalog: Catalog, spriteId: string): NaturePick | null {
  const sprite = catalog.sprites.find((s) => s.id === spriteId);
  const race = (sprite?.race ?? {}) as Partial<Record<StatKey, number>>;
  if (!sprite) return null;
  const rules = recommendRules(catalog.stats);
  const atkHigh: StatKey = toNum(race.atk, 0) >= toNum(race.spatk, 0) ? "atk" : "spatk";
  const atkLow: StatKey = atkHigh === "atk" ? "spatk" : "atk";
  const strong = toNum(race[atkHigh], 0) >= rules.attackThreshold;
  const fast = toNum(race.speed, 0) >= rules.speedThreshold;
  const bulky = toNum(race.hp, 0) >= rules.hpThreshold;

  let up: StatKey;
  if (fast && strong) up = "speed";
  else if (strong) up = atkHigh;
  else if (bulky) up = "hp";
  else up = [...STAT_KEYS].sort((a, b) => toNum(race[b], 0) - toNum(race[a], 0))[0];

  let down: StatKey = atkLow === up ? "spdef" : atkLow; // 下降项优先取没用的较弱攻击
  if (down === up) down = "spdef";
  const found = (catalog.stats?.natures ?? []).find((n) => (n.up ?? null) === up && (n.down ?? null) === down);
  return found ? { id: found.id, up, down } : null;
}

export interface BuildRecommendation extends TalentRecommendation {
  /** 推荐（或沿用）的性格 id。 */
  nature: string;
  /** true = 性格由种族自动选出。 */
  natureAuto: boolean;
}

/** 完整推荐：性格 + 加点。已有明确性格（有 up）则沿用，仅中性 / 未选时按种族自动选。 */
export function recommendBuild(
  catalog: Catalog,
  instance: { spriteId: string; stars: number; nature: string | null },
): BuildRecommendation {
  const current = (catalog.stats?.natures ?? []).find((n) => n.id === instance.nature);
  let nature = instance.nature ?? "neutral";
  let natureAuto = false;
  if (!current?.up) {
    const pick = recommendNature(catalog, instance.spriteId);
    if (pick) {
      nature = pick.id;
      natureAuto = true;
    }
  }
  const base = recommendTalent(catalog, { ...instance, nature });
  return { ...base, nature, natureAuto };
}
