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

/** 单个技能的当次有效能耗（已 clamp ≥0、已取整）。 */
export function effectiveCost(state: BattleState, bundle: DataBundle, side: Side, skillId: string): number {
  const active = side === "player" ? state.player.active : state.enemy.active;
  const base = toNum(getSkill(bundle, skillId).cost, 0);
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
  return Math.max(0, Math.floor(multiplied + added));
}

/** 该精灵当前可见的能耗修正明细（供 UI hover / 对手侧）。 */
export function costModBreakdown(state: BattleState, bundle: DataBundle, side: Side, skillId: string) {
  const active = side === "player" ? state.player.active : state.enemy.active;
  return (active.costMods ?? []).filter((mod) => costModMatches(active, skillId, bundle, mod));
}
