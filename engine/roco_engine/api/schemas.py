"""API 契约（Pydantic）：请求 / 响应双侧声明，字段 camelCase。"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def to_camel(s: str) -> str:
    head, *rest = s.split("_")
    return head + "".join(w.capitalize() for w in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class ActiveSpriteSchema(CamelModel):
    sprite_id: str
    hp: int
    max_hp: int
    energy: int = 0
    buffs: dict[str, float] = Field(default_factory=dict)
    debuffs: dict[str, float] = Field(default_factory=dict)
    marks: dict[str, int] = Field(default_factory=dict)
    statuses: dict[str, int] = Field(default_factory=dict)


class SideSchema(CamelModel):
    magic: int
    active: ActiveSpriteSchema
    bench: list[ActiveSpriteSchema] = Field(default_factory=list)
    seen_enemy: list[str] = Field(default_factory=list)
    wish_charges_left: int = 0
    wish_cooldown: int = 0
    leader_used: bool = False


class WeatherSchema(CamelModel):
    id: str
    turns_left: int


class BattleStateSchema(CamelModel):
    turn: int = 1
    player: SideSchema
    enemy: SideSchema
    weather: Optional[WeatherSchema] = None
    seed: int = 0


class ActionSchema(CamelModel):
    kind: Literal["skill", "defend", "switch", "wish", "leader"]
    skill_id: Optional[str] = None
    bench_id: Optional[str] = None
    label: str = ""


class OptionsSchema(CamelModel):
    max_iterations: int = 1000
    time_limit_ms: int = 1500
    exploration_c: float = 1.414
    rollout_max_turns: int = 12
    seed: int = 42
    opponent_model: Optional[dict[str, float]] = None


class SimulateTurnRequest(CamelModel):
    state: BattleStateSchema
    player_action: ActionSchema
    enemy_action: ActionSchema
    seed: int = 42


class RecommendRequest(CamelModel):
    state: BattleStateSchema
    options: OptionsSchema = Field(default_factory=OptionsSchema)


class ObserveRequest(CamelModel):
    enemy_active_id: Optional[str] = None
    action_class: Literal["A", "D", "S"]
    prior: Optional[dict[str, float]] = None


# ------------------------------------------------------------------ 转换
def state_to_engine(schema: BattleStateSchema):
    from ..models import ActiveSprite, BattleState, SideState, Weather

    def to_active(a: ActiveSpriteSchema) -> ActiveSprite:
        return ActiveSprite(
            sprite_id=a.sprite_id,
            hp=a.hp,
            max_hp=a.max_hp,
            energy=a.energy,
            buffs=dict(a.buffs),
            debuffs=dict(a.debuffs),
            marks=dict(a.marks),
            statuses=dict(a.statuses),
        )

    def to_side(s: SideSchema) -> SideState:
        return SideState(
            magic=s.magic,
            active=to_active(s.active),
            bench=[to_active(b) for b in s.bench],
            seen_enemy=list(s.seen_enemy),
            wish_charges_left=s.wish_charges_left,
            wish_cooldown=s.wish_cooldown,
            leader_used=s.leader_used,
        )

    return BattleState(
        turn=schema.turn,
        player=to_side(schema.player),
        enemy=to_side(schema.enemy),
        weather=Weather(schema.weather.id, schema.weather.turns_left) if schema.weather else None,
        seed=schema.seed,
    )


def action_to_engine(schema: ActionSchema):
    from ..models import Action

    return Action(kind=schema.kind, skill_id=schema.skill_id, bench_id=schema.bench_id, label=schema.label)


def state_from_engine(st) -> dict[str, Any]:
    def active_to(a) -> dict[str, Any]:
        return {
            "spriteId": a.sprite_id,
            "hp": a.hp,
            "maxHp": a.max_hp,
            "energy": a.energy,
            "buffs": a.buffs,
            "debuffs": a.debuffs,
            "marks": a.marks,
            "statuses": a.statuses,
        }

    def side_to(s) -> dict[str, Any]:
        return {
            "magic": s.magic,
            "active": active_to(s.active),
            "bench": [active_to(b) for b in s.bench],
            "seenEnemy": s.seen_enemy,
            "wishChargesLeft": s.wish_charges_left,
            "wishCooldown": s.wish_cooldown,
            "leaderUsed": s.leader_used,
        }

    return {
        "turn": st.turn,
        "player": side_to(st.player),
        "enemy": side_to(st.enemy),
        "weather": {"id": st.weather.id, "turnsLeft": st.weather.turns_left} if st.weather else None,
        "seed": st.seed,
    }
