"""MCTS：可复现、输出契约、动作排序。"""

from __future__ import annotations

from roco_engine.mcts.search import MCTS, MCTSConfig


def test_reproducible_and_contract(bundle, sim, make_state):
    st = make_state()
    cfg = MCTSConfig(max_iterations=60, time_limit_ms=60000, seed=7)
    a = MCTS(sim, cfg).search(st)
    b = MCTS(sim, cfg).search(st)

    assert a["actions"] == b["actions"]
    assert a["meta"]["iterations"] == 60
    assert all(0.0 <= x["winRate"] <= 1.0 for x in a["actions"])
    assert abs(sum(a["opponent"].values()) - 1.0) < 1e-6


def test_actions_sorted_desc(bundle, sim, make_state):
    st = make_state()
    cfg = MCTSConfig(max_iterations=80, time_limit_ms=60000, seed=3)
    out = MCTS(sim, cfg).search(st)
    rates = [x["winRate"] for x in out["actions"]]
    assert rates == sorted(rates, reverse=True)


def test_opponent_model_shifts_with_observation(bundle, sim, make_state):
    from roco_engine.opponent.bayes import OpponentModel

    model = OpponentModel()
    base = model.probabilities()["A"]
    for _ in range(10):
        model.observe("A")
    assert model.probabilities()["A"] > base
