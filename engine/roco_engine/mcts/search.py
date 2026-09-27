"""MCTS 搜索：我方建树，对手用贝叶斯模型采样。"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import Any

from ..models import Action, BattleState, Side
from ..opponent.bayes import OpponentModel
from ..simulator.battle import Simulator

PLAYER: Side = "player"
ENEMY: Side = "enemy"


@dataclass
class MCTSConfig:
    max_iterations: int = 1000
    time_limit_ms: int = 1500
    exploration_c: float = 1.414
    rollout_max_turns: int = 12
    seed: int = 42


@dataclass
class Node:
    state: BattleState
    parent: "Node | None" = None
    action: Action | None = None
    visits: int = 0
    value: float = 0.0
    children: list["Node"] = field(default_factory=list)
    untried: list[Action] = field(default_factory=list)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class MCTS:
    def __init__(self, sim: Simulator, config: MCTSConfig | None = None) -> None:
        self.sim = sim
        self.cfg = config or MCTSConfig()
        self.rng = random.Random(self.cfg.seed)

    # -------------------------------------------------------------- 对手采样
    def _sample_opponent(self, state: BattleState, model: OpponentModel) -> Action:
        legal = self.sim.legal_actions(state, ENEMY)
        if not legal:
            return Action("defend")
        wanted = model.sample_class(self.rng)
        if wanted == "A":
            pool = [a for a in legal if self.sim._action_type(self.sim.data, a) == "Attack"]
        elif wanted == "D":
            pool = [a for a in legal if self.sim._action_type(self.sim.data, a) == "Defense"]
        else:
            pool = [a for a in legal if self.sim._action_type(self.sim.data, a) == "Status"]
        if not pool:
            pool = legal
        return self.rng.choice(pool)

    # -------------------------------------------------------------- 估值
    def _evaluate(self, state: BattleState) -> float:
        term = self.sim.terminal(state)
        if term.ended:
            return 1.0 if term.winner == PLAYER else 0.0
        ev = self.sim.data.rules.get("mctsEval", {})
        w_magic = float(ev.get("wMagic", 0.4))
        w_hp = float(ev.get("wHpRatio", 2.0))
        w_bench = float(ev.get("wBench", 0.2))

        p, e = state.player, state.enemy
        my_hp = p.active.hp / max(p.active.max_hp, 1)
        en_hp = e.active.hp / max(e.active.max_hp, 1)
        my_bench = sum(1 for b in p.bench if b.alive())
        en_bench = sum(1 for b in e.bench if b.alive())
        score = w_magic * (p.magic - e.magic) + w_hp * (my_hp - en_hp) + w_bench * (my_bench - en_bench)
        return _sigmoid(score)

    # -------------------------------------------------------------- rollout
    def _rollout(self, state: BattleState, model: OpponentModel) -> float:
        st = state.clone()
        turns = 0
        while turns < self.cfg.rollout_max_turns:
            term = self.sim.terminal(st)
            if term.ended:
                return 1.0 if term.winner == PLAYER else 0.0
            p_actions = self.sim.legal_actions(st, PLAYER)
            if not p_actions:
                break
            e_action = self._sample_opponent(st, model)
            st = self.sim.step(st, self.rng.choice(p_actions), e_action, self.rng).state
            turns += 1
        return self._evaluate(st)

    # -------------------------------------------------------------- UCB
    def _ucb(self, child: Node, parent_visits: int) -> float:
        if child.visits == 0:
            return float("inf")
        exploit = child.value / child.visits
        explore = self.cfg.exploration_c * math.sqrt(math.log(parent_visits + 1) / child.visits)
        return exploit + explore

    def _select(self, node: Node) -> Node:
        while node.untried == [] and node.children:
            node = max(node.children, key=lambda c: self._ucb(c, node.visits))
        return node

    def _expand(self, node: Node, model: OpponentModel) -> Node:
        action = node.untried.pop()
        e_action = self._sample_opponent(node.state, model)
        result = self.sim.step(node.state, action, e_action, self.rng)
        child = Node(state=result.state, parent=node, action=action)
        child.untried = self.sim.legal_actions(child.state, PLAYER)
        node.children.append(child)
        return child

    def search(
        self,
        root_state: BattleState,
        model: OpponentModel | None = None,
    ) -> dict[str, Any]:
        model = model or OpponentModel()
        root = Node(state=root_state.clone())
        root.untried = self.sim.legal_actions(root.state, PLAYER)

        start = time.monotonic()
        iterations = 0
        while iterations < self.cfg.max_iterations:
            if (time.monotonic() - start) * 1000 >= self.cfg.time_limit_ms:
                break
            iterations += 1
            node = self._select(root)
            term = self.sim.terminal(node.state)
            if not term.ended and node.untried:
                node = self._expand(node, model)
            value = self._evaluate(node.state) if self.sim.terminal(node.state).ended else self._rollout(node.state, model)
            while node is not None:
                node.visits += 1
                node.value += value
                node = node.parent

        elapsed_ms = int((time.monotonic() - start) * 1000)
        results = []
        for child in root.children:
            wr = child.value / child.visits if child.visits else 0.0
            results.append(
                {
                    "action": child.action.to_dict() if child.action else {},
                    "label": child.action.label if child.action else "",
                    "winRate": round(wr, 4),
                    "visits": child.visits,
                    "score": round(wr, 4),
                }
            )
        results.sort(key=lambda r: (r["winRate"], r["visits"]), reverse=True)
        return {
            "actions": results,
            "opponent": model.probabilities(),
            "meta": {
                "iterations": iterations,
                "elapsedMs": elapsed_ms,
                "searchedTurns": self.cfg.rollout_max_turns,
                "seed": self.cfg.seed,
            },
        }
