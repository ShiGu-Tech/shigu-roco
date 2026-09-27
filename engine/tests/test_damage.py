"""伤害公式：克制、STAB、暴击、随机区间。"""

from __future__ import annotations

import random

from roco_engine.effects import compute_damage
from roco_engine.models import ActiveSprite

FIRE_ATTACKER = {
    "elements": ["Fire"],
    "race": {"hp": 100, "atk": 100, "defense": 100, "spatk": 100, "spdef": 100, "speed": 100},
}
NEUTRAL_DEFENDER = {
    "elements": ["Normal"],
    "race": {"hp": 100, "atk": 100, "defense": 100, "spatk": 100, "spdef": 100, "speed": 100},
}
SKILL = {"element": "Fire", "category": "Physical", "power": 100}


def _active() -> ActiveSprite:
    return ActiveSprite(sprite_id="x", hp=300, max_hp=300, energy=10)


def _damage(bundle, defender_elements, *, force_crit=None, rng_seed=1):
    defender = dict(NEUTRAL_DEFENDER)
    defender["elements"] = defender_elements
    return compute_damage(
        bundle,
        FIRE_ATTACKER,
        defender,
        _active(),
        _active(),
        SKILL,
        force_crit=force_crit,
        rng=random.Random(rng_seed),
    )


def test_type_advantage(bundle):
    grass = _damage(bundle, ["Grass"]).damage
    water = _damage(bundle, ["Water"]).damage
    assert grass > water


def test_stab_applies_when_same_element(bundle):
    res = _damage(bundle, ["Normal"])
    assert res.stab == 1.5


def test_crit_increases_damage(bundle):
    normal = _damage(bundle, ["Normal"], force_crit=False).damage
    crit = _damage(bundle, ["Normal"], force_crit=True).damage
    assert crit > normal


def test_zero_power_is_zero(bundle):
    res = compute_damage(
        bundle, FIRE_ATTACKER, NEUTRAL_DEFENDER, _active(), _active(),
        {"element": "Fire", "category": "Status", "power": 0}, rng=random.Random(1),
    )
    assert res.damage == 0
