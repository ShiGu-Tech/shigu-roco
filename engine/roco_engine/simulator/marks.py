"""印记结算。"""

from __future__ import annotations

import random

from ..config import DataBundle
from ..effects import EffectContext, apply_ops
from ..models import BattleState, Event, Side


def settle_marks(
    state: BattleState,
    timing: str,
    data: DataBundle,
    rng: random.Random,
) -> list[Event]:
    """遍历双方（及场地）印记，按 trigger 时机执行 ops。"""
    events: list[Event] = []
    for side in ("player", "enemy"):
        carrier_side: Side = side  # type: ignore[assignment]
        active = state.side(carrier_side).active
        for mark_id, stack in list(active.marks.items()):
            mdef = data.mark(mark_id)
            if not mdef or mdef.get("trigger") != timing:
                continue
            opponent: Side = "enemy" if carrier_side == "player" else "player"
            ctx = EffectContext(
                state=state,
                data=data,
                rng=rng,
                caster_side=carrier_side,
                target_side=opponent,
            )
            apply_ops(mdef.get("ops", []), ctx)
            events.extend(ctx.events)
    return events


def clear_marks_on_switch(state: BattleState, who: Side, data: DataBundle) -> list[Event]:
    """换人时清除 clearOnSwitch 的印记。"""
    events: list[Event] = []
    active = state.side(who).active
    for mark_id in list(active.marks.keys()):
        mdef = data.mark(mark_id)
        if mdef.get("clearOnSwitch"):
            active.marks.pop(mark_id, None)
            events.append(Event("mark", who, f"{active.sprite_id} 下场清除印记 {mark_id}"))
    return events
