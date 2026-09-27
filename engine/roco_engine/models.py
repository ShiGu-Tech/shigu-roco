"""运行时领域模型（非数据层；数据层是 data/*.json）。

设计要点：状态对象不可变式使用——调用方用 ``clone()`` 派生副本，
模拟器 ``step`` 不修改入参，便于 MCTS 树节点共存与回溯。
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Literal, Optional

Side = Literal["player", "enemy"]
ActionKind = Literal["skill", "defend", "switch", "wish", "leader"]


@dataclass
class ActiveSprite:
    """场上 / 背包中一只精灵的运行时实例。"""

    sprite_id: str
    hp: int
    max_hp: int
    energy: int = 0
    buffs: dict[str, float] = field(default_factory=dict)
    debuffs: dict[str, float] = field(default_factory=dict)
    marks: dict[str, int] = field(default_factory=dict)  # mark id -> 层数
    statuses: dict[str, int] = field(default_factory=dict)  # 状态 -> 剩余回合

    def clone(self) -> "ActiveSprite":
        return replace(
            self,
            buffs=dict(self.buffs),
            debuffs=dict(self.debuffs),
            marks=dict(self.marks),
            statuses=dict(self.statuses),
        )

    def alive(self) -> bool:
        return self.hp > 0


@dataclass
class SideState:
    """一方（我方 / 敌方）的完整状态。"""

    magic: int
    active: ActiveSprite
    bench: list[ActiveSprite] = field(default_factory=list)
    seen_enemy: list[str] = field(default_factory=list)  # 我方视角：敌方已登场
    wish_charges_left: int = 0
    wish_cooldown: int = 0
    leader_used: bool = False

    def clone(self) -> "SideState":
        return replace(
            self,
            active=self.active.clone(),
            bench=[b.clone() for b in self.bench],
            seen_enemy=list(self.seen_enemy),
        )

    def all_sprites(self) -> list[ActiveSprite]:
        return [self.active, *self.bench]

    def has_bench(self) -> bool:
        return any(b.alive() for b in self.bench)


@dataclass
class Weather:
    id: str
    turns_left: int

    def clone(self) -> "Weather":
        return replace(self)


@dataclass
class BattleState:
    """完整对局状态（MDP 的 S）。"""

    turn: int
    player: SideState
    enemy: SideState
    weather: Optional[Weather] = None
    seed: int = 0

    def clone(self) -> "BattleState":
        return replace(
            self,
            player=self.player.clone(),
            enemy=self.enemy.clone(),
            weather=self.weather.clone() if self.weather else None,
        )

    def side(self, who: Side) -> SideState:
        return self.player if who == "player" else self.enemy

    def opponent(self, who: Side) -> SideState:
        return self.enemy if who == "player" else self.player


@dataclass
class Action:
    """一个可执行动作。"""

    kind: ActionKind
    skill_id: Optional[str] = None
    bench_id: Optional[str] = None
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"kind": self.kind}
        if self.skill_id is not None:
            out["skillId"] = self.skill_id
        if self.bench_id is not None:
            out["benchId"] = self.bench_id
        if self.label:
            out["label"] = self.label
        return out


@dataclass
class Event:
    """结算产生的可读事件，供日志 / 前端展示 / 对拍。"""

    type: str
    side: Optional[str]
    text: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class StepResult:
    state: BattleState
    events: list[Event]
    phase_logs: list[str] = field(default_factory=list)


@dataclass
class Terminal:
    ended: bool
    winner: Optional[Side] = None  # 胜方；None 表示平/未结束
    reason: str = ""
