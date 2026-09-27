"""印记结算与换人清除。"""

from __future__ import annotations

import random

from roco_engine.simulator.marks import clear_marks_on_switch, settle_marks


def test_burn_settles_at_turn_end(bundle, make_state):
    st = make_state()
    st.player.active.marks = {"burn": 5}
    before = st.player.active.hp
    events = settle_marks(st, "turnEnd", bundle, random.Random(1))
    assert st.player.active.hp < before
    assert any(e.type == "damage" for e in events)


def test_burn_not_cleared_on_switch(bundle, make_state):
    st = make_state()
    st.player.active.marks = {"burn": 5}
    clear_marks_on_switch(st, "player", bundle)
    assert st.player.active.marks.get("burn") == 5


def test_mark_stack_cap(bundle, make_state):
    from roco_engine.effects import EffectContext, apply_ops

    st = make_state()
    ctx = EffectContext(st, bundle, random.Random(1), "player", "enemy")
    apply_ops([{"kind": "add_mark", "target": "enemy", "mark": "burn", "stack": 999}], ctx)
    cap = bundle.mark("burn")["maxStack"]
    assert st.enemy.active.marks["burn"] == cap
