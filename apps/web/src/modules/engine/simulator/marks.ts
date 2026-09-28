/** 印记结算。对应 Python simulator/marks.py。 */

import { getMark } from "../data";
import { EffectContext, applyOps } from "../effects/interpreter";
import type { Rng } from "../rng";
import type { BattleEvent, BattleState, DataBundle, Side } from "../types";
import { toStr } from "../types";

export function settleMarks(state: BattleState, timing: string, bundle: DataBundle, rng: Rng): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const side of ["player", "enemy"] as Side[]) {
    const active = (side === "player" ? state.player : state.enemy).active;
    for (const [markId, stack] of Object.entries({ ...active.marks })) {
      const mdef = getMark(bundle, markId);
      if (!mdef || toStr(mdef.trigger) !== timing) continue;
      void stack;
      const opponent: Side = side === "player" ? "enemy" : "player";
      const ctx = new EffectContext({
        state,
        bundle,
        rng,
        casterSide: side,
        targetSide: opponent,
        events,
      });
      applyOps(mdef.ops as never, ctx);
    }
  }
  return events;
}

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
