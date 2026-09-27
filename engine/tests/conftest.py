"""共享夹具：加载真实 data/ 并构造测试对局状态。"""

from __future__ import annotations

import pytest

from roco_engine import load_data
from roco_engine.models import ActiveSprite, BattleState, SideState
from roco_engine.simulator.battle import Simulator


@pytest.fixture(scope="session")
def bundle():
    return load_data()


@pytest.fixture
def sim(bundle):
    return Simulator(bundle)


@pytest.fixture
def make_active(bundle):
    def _make(sprite_id: str, hp: int | None = None, energy: int = 10, marks: dict | None = None) -> ActiveSprite:
        sp = bundle.sprite(sprite_id)
        max_hp = int(sp["race"]["hp"]) * 3
        return ActiveSprite(
            sprite_id=sprite_id,
            hp=max_hp if hp is None else hp,
            max_hp=max_hp,
            energy=energy,
            marks=marks or {},
        )

    return _make


@pytest.fixture
def make_state(make_active):
    def _make(player: str = "sp-7", enemy: str = "sp-10", player_bench=(), enemy_bench=()) -> BattleState:
        return BattleState(
            turn=1,
            player=SideState(
                magic=3,
                active=make_active(player),
                bench=[make_active(b) for b in player_bench],
                wish_charges_left=2,
            ),
            enemy=SideState(
                magic=3,
                active=make_active(enemy),
                bench=[make_active(b) for b in enemy_bench],
                wish_charges_left=2,
            ),
        )

    return _make
