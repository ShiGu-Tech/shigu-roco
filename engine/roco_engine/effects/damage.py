"""伤害计算。所有系数来自 data/rules.json 的 damageFormula，便于真机校准。"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

from ..config import DataBundle
from ..models import ActiveSprite

STAT_KEYS = ("hp", "atk", "defense", "spatk", "spdef", "speed")


@dataclass
class DamageResult:
    damage: int
    crit: bool
    type_mult: float
    stab: float
    effective: int


def effective_stat(base: int, active: ActiveSprite, stat: str) -> float:
    """基础值 × (1 + 增益 + 减益)。增益为正、减益为负。"""
    bonus = active.buffs.get(stat, 0.0) + active.debuffs.get(stat, 0.0)
    return base * (1.0 + bonus)


def base_stat(sprite_def: dict[str, Any], stat: str) -> int:
    race = sprite_def.get("race", {})
    return int(race.get(stat, 0))


def compute_damage(
    data: DataBundle,
    attacker_def: dict[str, Any],
    defender_def: dict[str, Any],
    attacker: ActiveSprite,
    defender: ActiveSprite,
    skill: dict[str, Any],
    *,
    weather_id: str | None = None,
    force_crit: bool | None = None,
    extra_mult: float = 1.0,
    rng: random.Random,
) -> DamageResult:
    power = float(skill.get("power", 0) or 0)
    if power <= 0:
        return DamageResult(0, False, 1.0, 1.0, 0)

    formula = data.rules.get("damageFormula", {})
    level = float(formula.get("level", 50))
    level_factor = float(formula.get("levelFactor", 2))
    power_scale = float(formula.get("powerScale", 1.0))
    ad_scale = float(formula.get("attackDefScale", 1.0))
    stab_value = float(formula.get("stab", 1.5))
    crit_rate = float(formula.get("critRate", 0.0625))
    crit_factor = float(formula.get("critFactor", 1.5))
    rand_lo, rand_hi = formula.get("randomRange", [0.85, 1.0])

    category = skill.get("category")
    if category == "Physical":
        atk = effective_stat(base_stat(attacker_def, "atk"), attacker, "atk")
        dfn = effective_stat(base_stat(defender_def, "defense"), defender, "defense")
    else:
        atk = effective_stat(base_stat(attacker_def, "spatk"), attacker, "spatk")
        dfn = effective_stat(base_stat(defender_def, "spdef"), defender, "spdef")
    dfn = max(dfn, 1.0)

    base = ((level_factor * level / 5 + 2) * (power * power_scale) * (atk / dfn * ad_scale)) / 50 + 2

    element = skill.get("element")
    attacker_elements = attacker_def.get("elements", [])
    defender_elements = defender_def.get("elements", [])
    stab = stab_value if element in attacker_elements else 1.0
    type_mult = data.type_multiplier(element, defender_elements)

    weather_mult = 1.0
    if weather_id:
        wdef = data.weather_def(weather_id)
        weather_mult = float(wdef.get("damageMod", {}).get(element, 1.0))

    crit = force_crit if force_crit is not None else (rng.random() < crit_rate)
    crit_mult = crit_factor if crit else 1.0
    random_mult = rng.uniform(float(rand_lo), float(rand_hi))

    damage = int(
        base * stab * type_mult * weather_mult * crit_mult * random_mult * extra_mult
    )
    damage = max(0, damage)
    return DamageResult(damage, crit, type_mult, stab, damage)
