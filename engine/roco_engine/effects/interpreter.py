"""效果 DSL 解释器：把 ops 应用到运行时状态。

术语：
- ``self``  = 施放者（技能场景）或印记携带者（印记场景）
- ``enemy`` = 目标方
- ``field`` = 场地

未知 op / when 记 warning 并安全跳过，保证「数据先行、代码后补」。
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from ..config import DataBundle
from ..models import ActiveSprite, BattleState, Event, Side
from .damage import compute_damage

MAX_STACK_FALLBACK = 999


@dataclass
class EffectContext:
    state: BattleState
    data: DataBundle
    rng: random.Random
    caster_side: Side
    target_side: Side
    defender_action: str | None = None  # 对方本回合动作大类：Attack/Defense/Status
    first_strike: bool = False
    extra_damage_mult: float = 1.0  # 愿力等全局乘区
    events: list[Event] = field(default_factory=list)

    def side_state(self, who: Side):
        return self.state.side(who)

    def active(self, who: Side) -> ActiveSprite:
        return self.state.side(who).active


def _log(ctx: EffectContext, etype: str, side: Side | None, text: str, **data: Any) -> None:
    ctx.events.append(Event(type=etype, side=side, text=text, data=data))


def eval_when(when: dict[str, Any], ctx: EffectContext) -> bool:
    """判断 when 谓词是否成立。"""
    tag = when.get("tag")
    if tag == "action":
        return ctx.defender_action == when.get("value")
    if tag == "firstStrike":
        return ctx.first_strike is bool(when.get("value"))
    if tag == "hpBelow":
        who = when.get("target", "enemy")
        active = ctx.active(ctx.target_side if who == "enemy" else ctx.caster_side)
        return active.hp <= float(when.get("ratio", 0)) * max(active.max_hp, 1)
    if tag == "hasMark":
        who = when.get("target", "enemy")
        active = ctx.active(ctx.target_side if who == "enemy" else ctx.caster_side)
        return active.marks.get(when.get("mark"), 0) >= int(when.get("stack", 1))
    if tag == "element":
        who = when.get("target", "enemy")
        side = ctx.target_side if who == "enemy" else ctx.caster_side
        sprite = ctx.data.sprite(ctx.active(side).sprite_id)
        return when.get("value") in sprite.get("elements", [])
    if tag == "weather":
        return bool(ctx.state.weather and ctx.state.weather.id == when.get("value"))
    if tag == "chance":
        return ctx.rng.random() < float(when.get("probability", 0))
    if tag == "all":
        return all(eval_when(w, ctx) for w in when.get("when", []))
    if tag == "any":
        return any(eval_when(w, ctx) for w in when.get("when", []))
    if tag == "not":
        return not eval_when(when.get("when", {}), ctx)
    return False


def _stack_cap(data: DataBundle, mark_id: str) -> int:
    return int(data.mark(mark_id).get("maxStack", MAX_STACK_FALLBACK))


def apply_ops(ops: list[dict[str, Any]], ctx: EffectContext) -> list[Event]:
    for op in ops or []:
        apply_op(op, ctx)
    return ctx.events


def apply_op(op: dict[str, Any], ctx: EffectContext) -> None:
    kind = op.get("kind")
    if kind == "conditional":
        if eval_when(op.get("when", {}), ctx):
            apply_ops(op.get("then", []), ctx)
        return
    if kind == "damage":
        _op_damage(op, ctx)
    elif kind == "heal":
        _op_heal(op, ctx)
    elif kind == "stat_mod":
        _op_stat_mod(op, ctx)
    elif kind == "add_mark":
        _op_add_mark(op, ctx, int(op.get("stack", 1)))
    elif kind == "remove_mark":
        _op_remove_mark(op, ctx)
    elif kind == "mark_delta":
        _op_add_mark(op, ctx, int(op.get("delta", 0)))
    elif kind == "energy":
        _op_energy(op, ctx)
    elif kind == "magic":
        _op_magic(op, ctx)
    elif kind == "status":
        _op_status(op, ctx)
    elif kind == "weather":
        _op_weather(op, ctx)
    elif kind == "priority":
        pass  # 由模拟器读取 skill.priority，预留
    elif kind == "damage_mult":
        if not op.get("when") or eval_when(op["when"], ctx):
            ctx.extra_damage_mult *= float(op.get("factor", 1.0))
    elif kind == "heal_from_damage":
        pass  # 吸血由伤害管线结合 lifesteal 处理，预留
    else:
        _log(ctx, "unknown_op", None, f"未实现的 op: {kind}", op=op)


def _target_active(op: dict[str, Any], ctx: EffectContext) -> tuple[ActiveSprite, Side]:
    who = op.get("target", "enemy")
    side = ctx.target_side if who == "enemy" else ctx.caster_side
    return ctx.active(side), side


def _op_damage(op: dict[str, Any], ctx: EffectContext) -> None:
    target, side = _target_active(op, ctx)
    if not target.alive():
        return
    basis = op.get("basis", "flat")
    if basis == "stack":
        damage = int(float(op.get("ratio", 0)) * target.marks.get(op.get("mark", ""), 0))
    elif basis == "maxHp":
        damage = int(float(op.get("ratio", 0)) * target.max_hp)
    elif basis == "currentHp":
        damage = int(float(op.get("ratio", 0)) * target.hp)
    else:
        damage = int(op.get("ratio", op.get("value", 0)))
    target.hp = max(0, target.hp - damage)
    _log(ctx, "damage", side, f"{target.sprite_id} 受到 {damage} 点伤害", value=damage)


def _op_heal(op: dict[str, Any], ctx: EffectContext) -> None:
    target, side = _target_active(op, ctx)
    basis = op.get("basis", "flat")
    if basis == "maxHp":
        amount = int(float(op.get("ratio", 0)) * target.max_hp)
    elif basis == "currentHp":
        amount = int(float(op.get("ratio", 0)) * target.hp)
    else:
        amount = int(op.get("ratio", op.get("value", 0)))
    target.hp = min(target.max_hp, target.hp + amount)
    _log(ctx, "heal", side, f"{target.sprite_id} 回复 {amount} 点生命", value=amount)


def _op_stat_mod(op: dict[str, Any], ctx: EffectContext) -> None:
    target, side = _target_active(op, ctx)
    stat = op.get("stat")
    value = float(op.get("value", 0))
    mode = op.get("mode", "percent")
    if mode == "percent":
        value = value / 100.0 if abs(value) > 1 else value
    bucket = target.buffs if value >= 0 else target.debuffs
    bucket[stat] = bucket.get(stat, 0.0) + value
    _log(ctx, "stat_mod", side, f"{target.sprite_id} {stat} {'+' if value >= 0 else ''}{value:.0%}")


def _op_add_mark(op: dict[str, Any], ctx: EffectContext, delta: int) -> None:
    target, side = _target_active(op, ctx)
    mark_id = op.get("mark")
    if not mark_id:
        return
    cap = _stack_cap(ctx.data, mark_id)
    current = target.marks.get(mark_id, 0)
    target.marks[mark_id] = max(0, min(cap, current + delta))
    if target.marks[mark_id] == 0:
        target.marks.pop(mark_id, None)
    _log(ctx, "mark", side, f"{target.sprite_id} 印记 {mark_id} {'+' if delta >= 0 else ''}{delta}", mark=mark_id, stack=target.marks.get(mark_id, 0))


def _op_remove_mark(op: dict[str, Any], ctx: EffectContext) -> None:
    target, side = _target_active(op, ctx)
    mark_id = op.get("mark")
    stack = op.get("stack", "all")
    if stack == "all":
        target.marks.pop(mark_id, None)
    else:
        remaining = target.marks.get(mark_id, 0) - int(stack)
        if remaining > 0:
            target.marks[mark_id] = remaining
        else:
            target.marks.pop(mark_id, None)
    _log(ctx, "mark", side, f"{target.sprite_id} 移除印记 {mark_id}")


def _op_energy(op: dict[str, Any], ctx: EffectContext) -> None:
    target, side = _target_active(op, ctx)
    target.energy = max(0, target.energy + int(op.get("delta", 0)))
    _log(ctx, "energy", side, f"{target.sprite_id} 能量 {op.get('delta', 0):+d}")


def _op_magic(op: dict[str, Any], ctx: EffectContext) -> None:
    who = op.get("target", "enemy")
    side: Side = ctx.target_side if who == "enemy" else ctx.caster_side
    ctx.side_state(side).magic = max(0, ctx.side_state(side).magic + int(op.get("delta", 0)))
    _log(ctx, "magic", side, f"魔力 {op.get('delta', 0):+d}", value=op.get("delta", 0))


def _op_status(op: dict[str, Any], ctx: EffectContext) -> None:
    target, side = _target_active(op, ctx)
    status = op.get("status")
    if op.get("chance"):
        if ctx.rng.random() >= float(op["chance"]):
            return
    target.statuses[status] = int(op.get("turns", 1))
    _log(ctx, "status", side, f"{target.sprite_id} 进入状态 {status}")


def _op_weather(op: dict[str, Any], ctx: EffectContext) -> None:
    from ..models import Weather

    weather_id = op.get("weather")
    if not weather_id:
        return
    turns = int(op.get("turns", ctx.data.weather_def(weather_id).get("defaultTurns", 5)))
    ctx.state.weather = Weather(id=weather_id, turns_left=turns)
    _log(ctx, "weather", None, f"天气变为 {weather_id}，持续 {turns} 回合")
