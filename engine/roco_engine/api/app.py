"""FastAPI 服务：引擎 HTTP 入口（仅回环）。

启动：uvicorn roco_engine.api.app:app --host 127.0.0.1 --port 26901
"""

from __future__ import annotations

import os
import random
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ..config import DataError, load_data
from ..mcts.search import MCTS, MCTSConfig
from ..models import Event
from ..opponent.bayes import OpponentModel
from ..simulator.battle import Simulator
from .schemas import (
    ObserveRequest,
    RecommendRequest,
    SimulateTurnRequest,
    action_to_engine,
    state_from_engine,
    state_to_engine,
)

app = FastAPI(title="roco-engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1", "http://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_DATA = {"bundle": None}


def _data_dir() -> str | None:
    return os.environ.get("ROCO_DATA_DIR")


def get_bundle():
    if _DATA["bundle"] is None:
        _DATA["bundle"] = load_data(_data_dir())
    return _DATA["bundle"]


@app.get("/health")
def health() -> dict[str, Any]:
    bundle = get_bundle()
    return {
        "status": "ok",
        "engineVersion": "0.1.0",
        "dataVersion": bundle.data_version,
        "dataUpdatedAt": bundle.data_updated_at,
        "counts": bundle.counts(),
        "warnings": bundle.warnings[:50],
    }


@app.post("/admin/reload")
def reload_data() -> dict[str, Any]:
    try:
        _DATA["bundle"] = load_data(_data_dir())
    except DataError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return health()


@app.get("/catalog")
def catalog() -> dict[str, Any]:
    bundle = get_bundle()
    sprites = []
    for sid, sp in bundle.sprites.items():
        skills = []
        for skill_id in sp.get("skillList", []):
            sk = bundle.skills.get(skill_id)
            if not sk:
                continue
            skills.append(
                {
                    "id": sk["id"],
                    "name": sk.get("skillName", sk["id"]),
                    "element": sk.get("element"),
                    "category": sk.get("category"),
                    "actionType": sk.get("actionType"),
                    "power": sk.get("power", 0),
                    "cost": sk.get("cost", 0),
                    "priority": sk.get("priority", 0),
                }
            )
        sprites.append(
            {
                "id": sid,
                "no": sp.get("no"),
                "name": sp.get("name"),
                "nameZh": sp.get("nameZh"),
                "stage": sp.get("stage"),
                "elements": sp.get("elements", []),
                "race": sp.get("race", {}),
                "trait": sp.get("trait", {}),
                "leaderAllowed": sp.get("leaderAllowed", True),
                "skills": skills,
            }
        )
    return {
        "dataVersion": bundle.data_version,
        "dataUpdatedAt": bundle.data_updated_at,
        "elements": bundle.elements.get("elements", []),
        "sprites": sprites,
        "marks": [{"id": m["id"], "name": m.get("name"), "maxStack": m.get("maxStack")} for m in bundle.marks.values()],
        "weather": [{"id": w["id"], "name": w.get("name")} for w in bundle.weather.values()],
        "rules": {
            "initialMagic": bundle.rules.get("magic", {}).get("initialPerSide", 3),
            "wishCharges": bundle.rules.get("wish", {}).get("maxUses", 2),
            "wishCooldown": bundle.rules.get("wish", {}).get("cooldown", 1),
            "leaderOnce": bundle.rules.get("leader", {}).get("once", True),
        },
        "warnings": bundle.warnings[:50],
    }


def _events_to_dict(events: list[Event]) -> list[dict[str, Any]]:
    return [{"type": e.type, "side": e.side, "text": e.text, "data": e.data} for e in events]


@app.post("/simulate/turn")
def simulate_turn(req: SimulateTurnRequest) -> dict[str, Any]:
    bundle = get_bundle()
    sim = Simulator(bundle)
    state = state_to_engine(req.state)
    rng = random.Random(req.seed)
    result = sim.step(state, action_to_engine(req.player_action), action_to_engine(req.enemy_action), rng)
    term = sim.terminal(result.state)
    return {
        "state": state_from_engine(result.state),
        "log": _events_to_dict(result.events),
        "phaseLogs": result.phase_logs,
        "terminal": {"ended": term.ended, "winner": term.winner, "reason": term.reason},
    }


@app.post("/recommend")
def recommend(req: RecommendRequest) -> dict[str, Any]:
    bundle = get_bundle()
    sim = Simulator(bundle)
    state = state_to_engine(req.state)
    model = OpponentModel.from_dict(req.options.opponent_model)
    cfg = MCTSConfig(
        max_iterations=req.options.max_iterations,
        time_limit_ms=req.options.time_limit_ms,
        exploration_c=req.options.exploration_c,
        rollout_max_turns=req.options.rollout_max_turns,
        seed=req.options.seed,
    )
    searcher = MCTS(sim, cfg)
    return searcher.search(state, model)


@app.post("/opponent/observe")
def observe(req: ObserveRequest) -> dict[str, Any]:
    model = OpponentModel.from_dict(req.prior)
    model.observe(req.action_class)
    return {"ok": True, "posterior": model.probabilities()}
