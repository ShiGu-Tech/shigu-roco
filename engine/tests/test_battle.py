"""回合结算：阶段推进、能量、换人、阵亡扣魔力、终止。"""

from __future__ import annotations

import random

from roco_engine.models import Action


def test_step_advances_turn_and_costs_energy(bundle, sim, make_state):
    st = make_state()
    skill_id = bundle.sprite("sp-7")["skillList"][0]
    before_energy = st.player.active.energy
    res = sim.step(st, Action("skill", skill_id=skill_id), Action("defend"), random.Random(1))
    assert res.state.turn == 2
    assert res.state.player.active.energy <= before_energy
    # 原状态未被就地修改（快照语义）
    assert st.turn == 1


def test_switch_changes_active(bundle, sim, make_state):
    st = make_state(player_bench=("sp-6",))
    res = sim.step(st, Action("switch", bench_id="sp-6"), Action("defend"), random.Random(1))
    assert res.state.player.active.sprite_id == "sp-6"


def test_faint_deducts_magic(bundle, sim, make_state):
    st = make_state()
    st.enemy.active.hp = 0
    sim._handle_faints(st)
    assert st.enemy.magic == 2


def test_terminal_by_magic(bundle, sim, make_state):
    st = make_state()
    st.enemy.magic = 0
    term = sim.terminal(st)
    assert term.ended and term.winner == "player"


def test_legal_actions_include_skills_and_wish(bundle, sim, make_state):
    st = make_state(player_bench=("sp-6",))
    actions = sim.legal_actions(st, "player")
    assert any(a.kind == "skill" for a in actions)
    assert any(a.kind == "switch" for a in actions)
    assert any(a.kind == "wish" for a in actions)
