"""引擎命令行入口（阶段 3 无 UI 核心原型）。

用法：
  python -m roco_engine.cli health
  python -m roco_engine.cli catalog
  python -m roco_engine.cli simulate --file turn.json
  python -m roco_engine.cli recommend --file state.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from .api.schemas import (
    RecommendRequest,
    SimulateTurnRequest,
    action_to_engine,
    state_from_engine,
    state_to_engine,
)
from .config import load_data
from .mcts.search import MCTS, MCTSConfig
from .opponent.bayes import OpponentModel
from .simulator.battle import Simulator


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cmd_health(_args) -> int:
    bundle = load_data()
    print(json.dumps({
        "status": "ok",
        "dataVersion": bundle.data_version,
        "counts": bundle.counts(),
        "warnings": bundle.warnings,
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_catalog(_args) -> int:
    bundle = load_data()
    print(json.dumps({
        "sprites": list(bundle.sprites.keys()),
        "skills": len(bundle.skills),
        "marks": list(bundle.marks.keys()),
        "weather": list(bundle.weather.keys()),
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_simulate(args) -> int:
    bundle = load_data()
    req = SimulateTurnRequest.model_validate(_load(args.file))
    sim = Simulator(bundle)
    result = sim.step(state_to_engine(req.state), action_to_engine(req.player_action), action_to_engine(req.enemy_action), random.Random(req.seed))
    print(json.dumps({
        "state": state_from_engine(result.state),
        "log": [e.text for e in result.events],
        "terminal": sim.terminal(result.state).__dict__,
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_recommend(args) -> int:
    bundle = load_data()
    req = RecommendRequest.model_validate(_load(args.file))
    sim = Simulator(bundle)
    cfg = MCTSConfig(
        max_iterations=req.options.max_iterations,
        time_limit_ms=req.options.time_limit_ms,
        exploration_c=req.options.exploration_c,
        rollout_max_turns=req.options.rollout_max_turns,
        seed=req.options.seed,
    )
    out = MCTS(sim, cfg).search(state_to_engine(req.state), OpponentModel.from_dict(req.options.opponent_model))
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="roco_engine")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("health").set_defaults(func=cmd_health)
    sub.add_parser("catalog").set_defaults(func=cmd_catalog)
    p_sim = sub.add_parser("simulate")
    p_sim.add_argument("--file", required=True)
    p_sim.set_defaults(func=cmd_simulate)
    p_rec = sub.add_parser("recommend")
    p_rec.add_argument("--file", required=True)
    p_rec.set_defaults(func=cmd_recommend)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
