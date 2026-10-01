/** 印记下场清理。印记的 DoT / 触发统一走机制扩展层的 turnEnd / onHit 触发器。 */

import { getMark } from "../data";
import type { BattleEvent, BattleState, DataBundle, Side } from "../types";

export function clearMarksOnSwitch(state: BattleState, who: Side, bundle: DataBundle): BattleEvent[] {
  const events: BattleEvent[] = [];
  const active = (who === "player" ? state.player : state.enemy).active;
  for (const markId of Object.keys({ ...active.marks })) {
    const mdef = getMark(bundle, markId);
    if (mdef.clearOnSwitch) {
      delete active.marks[markId];
      events.push({ type: "mark", side: who, text: `${active.spriteId} 下场清除印记 ${markId}`, data: {} });
    }
  }
  return events;
}
