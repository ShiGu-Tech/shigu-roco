/** 印记结算。对应 Python simulator/marks.py。 */

import { getMark } from "../data";
import { MechanismRegistry, MechanismRuntime, mechanismsFromData } from "../mechanisms";
import type { BattleEvent, BattleState, DataBundle, Side } from "../types";
import { toStr } from "../types";

export function settleMarks(state: BattleState, timing: string, bundle: DataBundle): BattleEvent[] {
  const events: BattleEvent[] = [];
  const runtime = new MechanismRuntime(new MechanismRegistry(mechanismsFromData(bundle.mechanisms)));
  for (const side of ["player", "enemy"] as Side[]) {
    const sideState = side === "player" ? state.player : state.enemy;
    const stores = [sideState.active.marks, sideState.teamMarks];
    for (const store of stores) for (const [markId, stack] of Object.entries({ ...store })) {
      const mdef = getMark(bundle, markId);
      if (!mdef || toStr(mdef.trigger) !== timing) continue;
      const opponent: Side = side === "player" ? "enemy" : "player";
      const commands = runtime.dispatch({ state, trigger: timing as never, actorSide: side, targetSide: opponent, event: { markId, stack } });
      events.push(...runtime.applyStateCommands(state, commands, bundle).map((event) => ({ type: event.type, side: event.side ?? null, text: `机制 ${event.mechanismId ?? ""}：${event.type}`, data: event.data })));
      events.push(...runtime.applyDamageCommands(state, bundle, commands).map((event) => ({ type: event.type, side: event.side ?? null, text: `机制 ${event.mechanismId ?? ""}：${event.type}`, data: event.data })));
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
