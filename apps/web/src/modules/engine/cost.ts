/** 有效能耗：声明式 `costMods` 的统一读取（执行 / legalActions / 预览 / Worker 共用）。
 *
 *  口径：`base × Π所有 multiply + Σ所有 delta`（同 key 的登记期已按 `mode` 去重 / 累积）→
 *  `floor`（省能耗方向）→ clamp ≥ 0。旧数据若仍写 `skillMods[skillId].cost` 亦计入。
 */

import { getSkill } from "./data";
import type { ActiveSprite, BattleState, DataBundle, Side } from "./types";
import { toNum } from "./types";

function costModMatches(active: ActiveSprite, skillId: string, bundle: DataBundle, mod: NonNullable<ActiveSprite["costMods"]>[number]): boolean {
  const skill = getSkill(bundle, skillId);
  if (mod.scope === "skill") {
    if (mod.skillId !== skillId) return false;
  } else if (mod.scope === "attack") {
    if (skill.category !== "Physical" && skill.category !== "Magic") return false;
  } else if (mod.scope === "defense") {
    if (skill.actionType !== "Defense") return false;
  }
  if (mod.slots && !mod.slots.includes(active.loadout.indexOf(skillId) + 1)) return false;
  const element = typeof skill.element === "string" ? skill.element : "";
  if (mod.elements?.length && !mod.elements.includes(element)) return false;
  if (mod.excludeElements?.length && mod.excludeElements.includes(element)) return false;
  return true;
}

/** 单个技能的当次有效能耗（已 clamp ≥0、已取整）。
 *  `rules` 为 passive 声明的规则覆盖：`cost.signFlip`（对流：增减反转）/ `cost.changeMul`（倾轧：变化幅度倍率）。 */
export function effectiveCost(state: BattleState, bundle: DataBundle, side: Side, skillId: string, rules?: Record<string, number | boolean>): number {
  const active = side === "player" ? state.player.active : state.enemy.active;
  // 规则覆盖 · `cost.lastTurnSum`（基因编辑）：基础能耗 = 上回合双方使用技能能耗之和。
  const base = rules?.["cost.lastTurnSum"] === true
    ? Math.max(0, Math.floor(toNum(state[side].lastTurn?.cost, 0) + toNum(state[side === "player" ? "enemy" : "player"].lastTurn?.cost, 0)))
    : toNum(getSkill(bundle, skillId).cost, 0);
  const mods = active.costMods ?? [];
  let multiplied = base;
  let added = 0;
  for (const mod of mods) {
    if (!costModMatches(active, skillId, bundle, mod)) continue;
    if (typeof mod.multiply === "number") multiplied *= mod.multiply;
    added += toNum(mod.delta, 0);
  }
  // 旧数据兼容：modifySkill.cost 仍可能写在这里。
  added += toNum(active.skillMods?.[skillId]?.cost, 0);
  // 巧变：临时技能（skillOverrides）自带的能耗修正。
  added += toNum(active.skillOverrides?.[skillId]?.cost, 0);
  // 规则覆盖 · `cost.wingAttack`（异类）：翼系攻击技能能耗 +1。
  if (rules?.["cost.wingAttack"] === true) {
    const skill = getSkill(bundle, skillId);
    const element = typeof skill.element === "string" ? skill.element : "";
    if (element === "Wing" && (skill.category === "Physical" || skill.category === "Magic")) added += 1;
  }
  let value = multiplied + added;
  if (rules?.["cost.signFlip"] === true) value = base - (value - base);
  if (typeof rules?.["cost.changeMul"] === "number") value = base + (value - base) * (rules["cost.changeMul"] as number);
  return Math.max(0, Math.floor(value));
}

/** 该精灵当前可见的能耗修正明细（供 UI hover / 对手侧）。 */
export function costModBreakdown(state: BattleState, bundle: DataBundle, side: Side, skillId: string) {
  const active = side === "player" ? state.player.active : state.enemy.active;
  return (active.costMods ?? []).filter((mod) => costModMatches(active, skillId, bundle, mod));
}
