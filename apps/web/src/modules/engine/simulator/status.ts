/** 状态（buff）下场清理：默认清除；`rules.status.persistOnSwitch` 列出的（冻结 / 萌化等）保留。 */

import type { BattleEvent, BattleState, DataBundle, Side } from "../types";
import { asDict, toArray } from "../types";

export function clearStatusesOnSwitch(state: BattleState, who: Side, bundle: DataBundle): BattleEvent[] {
  const active = (who === "player" ? state.player : state.enemy).active;
  const config = asDict(asDict(bundle.rules).status);
  if (config.clearOnSwitch === false) return [];
  const persist = new Set(toArray<string>(config.persistOnSwitch));
  const events: BattleEvent[] = [];
  for (const statusId of Object.keys({ ...active.statuses })) {
    if (persist.has(statusId)) continue;
    delete active.statuses[statusId];
    events.push({ type: "status", side: who, text: `${active.spriteId} 下场清除状态 ${statusId}`, data: { statusId } });
  }
  return events;
}
