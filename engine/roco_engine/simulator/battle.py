"""战斗模拟器（MDP 环境）：按四阶段回合结算。"""

from __future__ import annotations

import random
from typing import Any

from ..config import DataBundle
from ..effects import EffectContext, apply_ops, base_stat, compute_damage, effective_stat
from ..models import (
    Action,
    ActiveSprite,
    BattleState,
    Event,
    Side,
    SideState,
    StepResult,
    Terminal,
)
from .marks import clear_marks_on_switch, settle_marks

OTHER: dict[str, Side] = {"player": "enemy", "enemy": "player"}


class Simulator:
    def __init__(self, data: DataBundle) -> None:
        self.data = data

    # ------------------------------------------------------------------ 动作
    def legal_actions(self, state: BattleState, who: Side) -> list[Action]:
        side = state.side(who)
        active = side.active
        sprite_def = self.data.sprite(active.sprite_id)
        actions: list[Action] = []

        for skill_id in sprite_def.get("loadout") or sprite_def.get("skillList", []):
            skill = self.data.skill(skill_id)
            if int(skill.get("cost", 0)) <= active.energy:
                actions.append(Action("skill", skill_id=skill_id, label=skill.get("skillName", skill_id)))

        for bench in side.bench:
            if bench.alive() and bench.sprite_id != active.sprite_id:
                actions.append(Action("switch", bench_id=bench.sprite_id, label=f"换 {bench.sprite_id}"))

        if side.wish_charges_left > 0 and side.wish_cooldown == 0:
            actions.append(Action("wish", label="愿力魔法"))

        if who == "player" and not side.leader_used and sprite_def.get("leaderAllowed", False):
            actions.append(Action("leader", label="首领化"))

        return actions

    # ------------------------------------------------------------------ 结算
    def step(
        self,
        state: BattleState,
        player_action: Action,
        enemy_action: Action,
        rng: random.Random,
    ) -> StepResult:
        st = state.clone()
        events: list[Event] = []
        logs: list[str] = []

        actions: dict[Side, Action] = {"player": player_action, "enemy": enemy_action}
        dcfg = self.data.rules

        # ① 洛克魔法阶段（愿力）
        for side, act in actions.items():
            if act.kind == "wish":
                s = st.side(side)
                if s.wish_charges_left > 0 and s.wish_cooldown == 0:
                    s.wish_charges_left -= 1
                    s.wish_cooldown = int(dcfg.get("wish", {}).get("cooldown", 1))
                    events.append(Event("wish", side, f"{side} 使用愿力魔法，剩余 {s.wish_charges_left} 次"))

        # ② 换人阶段
        switch_sides = [s for s, a in actions.items() if a.kind == "switch"]
        if switch_sides:
            switch_sides.sort(
                key=lambda s: effective_stat(
                    base_stat(self.data.sprite(st.side(s).active.sprite_id), "speed"),
                    st.side(s).active,
                    "speed",
                ),
                reverse=True,
            )
            for side in switch_sides:
                events.extend(self._do_switch(st, side, actions[side].bench_id))  # type: ignore[arg-type]
                logs.append(f"switch: {side} -> {actions[side].bench_id}")

        # 首领化（属动作，独立于技能）
        for side, act in actions.items():
            if act.kind == "leader":
                events.extend(self.apply_leader(st, side))
                logs.append(f"leader: {side}")

        # ③ 精灵技能阶段
        actors: list[Side] = [s for s, a in actions.items() if a.kind == "skill"]
        actors.sort(key=lambda s: self._order_key(st, s, actions[s]), reverse=True)
        for idx, side in enumerate(actors):
            caster = st.side(side).active
            if not caster.alive():
                continue
            opp = OTHER[side]
            defender_action = self._action_type(self.data, actions[opp])
            events.extend(
                self._execute_skill(
                    st, side, actions[side], defender_action, first_strike=(idx == 0), rng=rng
                )
            )
            logs.append(f"skill: {side} -> {actions[side].skill_id}")

        # ④ 结算阶段
        events.extend(settle_marks(st, "turnEnd", self.data, rng))
        self._decay(st)
        events.extend(self._handle_faints(st))

        st.turn += 1
        return StepResult(state=st, events=events, phase_logs=logs)

    # -------------------------------------------------------------- 内部工具
    def _action_type(self, data: DataBundle, action: Action) -> str:
        if action.kind == "skill" and action.skill_id:
            return str(data.skill(action.skill_id).get("actionType", "Attack"))
        if action.kind == "defend":
            return "Defense"
        if action.kind == "switch":
            return "Switch"
        return "Status"

    def _order_key(self, st: BattleState, side: Side, action: Action) -> tuple[int, float]:
        priority = 0
        if action.kind == "skill" and action.skill_id:
            priority = int(self.data.skill(action.skill_id).get("priority", 0))
        active = st.side(side).active
        speed = effective_stat(base_stat(self.data.sprite(active.sprite_id), "speed"), active, "speed")
        return (priority, speed)

    def _do_switch(self, st: BattleState, side: Side, bench_id: str | None) -> list[Event]:
        events: list[Event] = []
        s = st.side(side)
        target = next((b for b in s.bench if b.sprite_id == bench_id and b.alive()), None)
        if target is None:
            return events
        events.extend(clear_marks_on_switch(st, side, self.data))
        old = s.active
        s.bench = [b for b in s.bench if b is not target]
        s.bench.append(old)
        s.active = target
        events.append(Event("switch", side, f"{side} 换上 {target.sprite_id}"))
        return events

    def _execute_skill(
        self,
        st: BattleState,
        side: Side,
        action: Action,
        defender_action: str,
        *,
        first_strike: bool,
        rng: random.Random,
    ) -> list[Event]:
        skill = self.data.skill(action.skill_id) if action.skill_id else {}
        caster = st.side(side).active
        caster.energy = max(0, caster.energy - int(skill.get("cost", 0)))
        opp = OTHER[side]
        target = st.side(opp).active
        caster_def = self.data.sprite(caster.sprite_id)

        ctx = EffectContext(
            state=st,
            data=self.data,
            rng=rng,
            caster_side=side,
            target_side=opp,
            defender_action=defender_action,
            first_strike=first_strike,
        )
        apply_ops(skill.get("ops", []), ctx)
        events = list(ctx.events)

        category = skill.get("category")
        if category in ("Physical", "Magic") and float(skill.get("power", 0) or 0) > 0 and target.alive():
            target_def = self.data.sprite(target.sprite_id)
            result = compute_damage(
                self.data,
                caster_def,
                target_def,
                caster,
                target,
                skill,
                weather_id=st.weather.id if st.weather else None,
                extra_mult=ctx.extra_damage_mult,
                rng=rng,
            )
            target.hp = max(0, target.hp - result.damage)
            events.append(
                Event(
                    "damage",
                    opp,
                    f"{caster.sprite_id} 对 {target.sprite_id} 造成 {result.damage} 伤害"
                    + ("（暴击）" if result.crit else ""),
                    data={"value": result.damage, "crit": result.crit},
                )
            )
        return events

    def _decay(self, st: BattleState) -> None:
        if st.weather:
            st.weather.turns_left -= 1
            if st.weather.turns_left <= 0:
                st.weather = None
        for side in ("player", "enemy"):
            s = st.side(side)  # type: ignore[arg-type]
            if s.wish_cooldown > 0:
                s.wish_cooldown -= 1
            for sprite in s.all_sprites():
                for status in list(sprite.statuses.keys()):
                    sprite.statuses[status] -= 1
                    if sprite.statuses[status] <= 0:
                        sprite.statuses.pop(status, None)

    def _handle_faints(self, st: BattleState) -> list[Event]:
        events: list[Event] = []
        per_faint = int(self.data.rules.get("magic", {}).get("perFaint", 1))
        for side in ("player", "enemy"):
            s: SideState = st.side(side)  # type: ignore[arg-type]
            if s.active.alive():
                continue
            s.magic -= per_faint
            events.append(Event("faint", side, f"{s.active.sprite_id} 阵亡，魔力 -{per_faint}"))
            alive = next((b for b in s.bench if b.alive()), None)
            if alive is not None:
                s.bench = [b for b in s.bench if b is not alive]
                s.bench.append(s.active)
                s.active = alive
                events.append(Event("switch", side, f"{side} 被迫换上 {alive.sprite_id}"))
        return events

    # ------------------------------------------------------------------ 终止
    def terminal(self, state: BattleState) -> Terminal:
        p, e = state.player, state.enemy
        if p.magic <= 0:
            return Terminal(True, "enemy", "我方魔力耗尽")
        if e.magic <= 0:
            return Terminal(True, "player", "敌方魔力耗尽")
        if not any(s.alive() for s in p.all_sprites()):
            return Terminal(True, "enemy", "我方精灵全部阵亡")
        if not any(s.alive() for s in e.all_sprites()):
            return Terminal(True, "player", "敌方精灵全部阵亡")
        return Terminal(False, None, "")

    def apply_leader(self, st: BattleState, side: Side) -> list[Event]:
        s = st.side(side)
        if s.leader_used:
            return []
        s.leader_used = True
        boost = float(self.data.rules.get("leader", {}).get("attackBoost", 0.0))
        if boost:
            s.active.buffs["atk"] = s.active.buffs.get("atk", 0.0) + boost
            s.active.buffs["spatk"] = s.active.buffs.get("spatk", 0.0) + boost
        return [Event("leader", side, f"{side} 首领化")]
