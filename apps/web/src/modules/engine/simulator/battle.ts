/** 战斗模拟器（MDP 环境）：按四阶段回合结算。对应 Python simulator/battle.py。 */

import { getSkill, getSprite } from "../data";
import { computeDamage, effectiveStat } from "../effects/damage";
import { EffectContext, applyOps } from "../effects/interpreter";
import type { Rng } from "../rng";
import { cloneState } from "../state";
import type { Action, BattleEvent, BattleState, DataBundle, Side, StepResult, Terminal } from "../types";
import { asDict, toArray, toNum, toStr } from "../types";
import { clearMarksOnSwitch, settleMarks } from "./marks";

const SIDES: Side[] = ["player", "enemy"];

function otherSide(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

export class Simulator {
  readonly bundle: DataBundle;

  constructor(bundle: DataBundle) {
    this.bundle = bundle;
  }

  private sideState(state: BattleState, who: Side) {
    return who === "player" ? state.player : state.enemy;
  }

  // ---------------------------------------------------------------- 动作
  legalActions(state: BattleState, who: Side): Action[] {
    const side = this.sideState(state, who);
    const active = side.active;
    const spriteDef = getSprite(this.bundle, active.spriteId);
    const actions: Action[] = [];

    if (active.hp <= 0) {
      for (const bench of side.bench) {
        if (bench.hp > 0) {
          const name = toStr(getSprite(this.bundle, bench.spriteId).name, bench.spriteId);
          actions.push({ kind: "switch", benchId: bench.spriteId, label: `换 ${name}` });
        }
      }
      return actions;
    }

    const loadout = active.loadout.length
      ? active.loadout
      : (toArray<string>(spriteDef.loadout).length ? toArray<string>(spriteDef.loadout) : toArray<string>(spriteDef.skillList));
    for (const skillId of loadout) {
      const skill = getSkill(this.bundle, skillId);
      if (toNum(skill.cost, 0) <= active.energy) {
        actions.push({ kind: "skill", skillId, label: toStr(skill.skillName, skillId) });
      }
    }

    for (const bench of side.bench) {
      if (bench.hp > 0 && bench.spriteId !== active.spriteId) {
        actions.push({ kind: "switch", benchId: bench.spriteId, label: `换 ${bench.spriteId}` });
      }
    }

    if (side.wishChargesLeft > 0 && side.wishCooldown === 0) {
      actions.push({ kind: "wish", label: "愿力冲击" });
    }

    const energyMax = toNum(asDict(this.bundle.rules.energy).max, 10);
    if (active.energy < energyMax) actions.push({ kind: "energy", label: "聚能" });

    return actions;
  }

  // ---------------------------------------------------------------- 结算
  step(state: BattleState, playerAction: Action, enemyAction: Action, rng: Rng): StepResult {
    const st = cloneState(state);
    const events: BattleEvent[] = [];
    const logs: string[] = [];
    const actions: Record<Side, Action> = { player: playerAction, enemy: enemyAction };
    const rules = this.bundle.rules;

    // ① 洛克魔法阶段（愿力）
    for (const side of SIDES) {
      const act = actions[side];
      if (act.kind !== "wish") continue;
      const s = this.sideState(st, side);
      if (s.wishChargesLeft > 0 && s.wishCooldown === 0) {
        s.wishChargesLeft -= 1;
        s.wishCooldown = Math.floor(toNum(asDict(rules.wish).cooldown, 1));
        events.push({
          type: "wish",
          side,
          text: `${side} 使用愿力冲击，剩余 ${s.wishChargesLeft} 次，冷却 ${s.wishCooldown} 回合`,
          data: {},
        });
      }
    }

    // ② 换人阶段
    const switchSides = SIDES.filter((s) => actions[s].kind === "switch");
    switchSides.sort((a, b) => this.speedOf(st, b) - this.speedOf(st, a));
    for (const side of switchSides) {
      events.push(...this.doSwitch(st, side, actions[side].benchId));
      logs.push(`switch: ${side} -> ${actions[side].benchId ?? ""}`);
    }

    // ③ 精灵技能阶段（含聚能）
    const actors = SIDES.filter((s) => actions[s].kind === "skill" || actions[s].kind === "energy");
    actors.sort((a, b) => this.compareOrder(st, a, actions[a], b, actions[b]));
    actors.forEach((side, idx) => {
      const caster = this.sideState(st, side).active;
      if (caster.hp <= 0) return;
      const opp = otherSide(side);
      const defenderAction = this.actionType(actions[opp]);
      if (actions[side].kind === "energy") {
        events.push(...this.applyEnergy(st, side));
        logs.push(`energy: ${side}`);
      } else {
        events.push(...this.executeSkill(st, side, actions[side], defenderAction, idx === 0, rng));
        logs.push(`skill: ${side} -> ${actions[side].skillId ?? ""}`);
      }
    });

    // ④ 结算阶段
    events.push(...settleMarks(st, "turnEnd", this.bundle, rng));
    this.decay(st);
    events.push(...this.handleFaints(st));

    st.turn += 1;
    return { state: st, events, phaseLogs: logs };
  }

  // -------------------------------------------------------------- 内部工具
  actionType(action: Action): string {
    if (action.kind === "skill" && action.skillId) {
      return toStr(getSkill(this.bundle, action.skillId).actionType, "Attack");
    }
    if (action.kind === "defend") return "Defense";
    if (action.kind === "switch") return "Switch";
    return "Status";
  }

  private speedOf(st: BattleState, side: Side): number {
    const active = this.sideState(st, side).active;
    const spriteDef = getSprite(this.bundle, active.spriteId);
    return effectiveStat(this.bundle, spriteDef, active, "speed");
  }

  private compareOrder(st: BattleState, a: Side, aAction: Action, b: Side, bAction: Action): number {
    const ka = this.orderKey(st, a, aAction);
    const kb = this.orderKey(st, b, bAction);
    if (ka[0] !== kb[0]) return kb[0] - ka[0];
    return kb[1] - ka[1];
  }

  private orderKey(st: BattleState, side: Side, action: Action): [number, number] {
    let priority = 0;
    if (action.kind === "skill" && action.skillId) {
      priority = Math.floor(toNum(getSkill(this.bundle, action.skillId).priority, 0));
    }
    return [priority, this.speedOf(st, side)];
  }

  private applyEnergy(st: BattleState, side: Side): BattleEvent[] {
    const active = this.sideState(st, side).active;
    const energy = asDict(this.bundle.rules.energy);
    const recover = Math.floor(toNum(energy.recover, 5));
    const cap = Math.floor(toNum(energy.max, 10));
    const before = active.energy;
    active.energy = Math.min(cap, active.energy + recover);
    const gained = active.energy - before;
    return [{ type: "energy", side, text: `${active.spriteId} 聚能 +${gained}（${active.energy}/${cap}）`, data: { value: gained } }];
  }

  doSwitch(st: BattleState, side: Side, benchId?: string): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideState(st, side);
    const target = s.bench.find((b) => b.spriteId === benchId && b.hp > 0);
    if (!target) return events;
    events.push(...clearMarksOnSwitch(st, side, this.bundle));
    const old = s.active;
    s.bench = s.bench.filter((b) => b !== target);
    s.bench.push(old);
    s.active = target;
    events.push({ type: "switch", side, text: `${side} 换上 ${target.spriteId}`, data: {} });
    return events;
  }

  private executeSkill(
    st: BattleState,
    side: Side,
    action: Action,
    defenderAction: string,
    firstStrike: boolean,
    rng: Rng,
  ): BattleEvent[] {
    const skill = action.skillId ? getSkill(this.bundle, action.skillId) : {};
    const caster = this.sideState(st, side).active;
    caster.energy = Math.max(0, caster.energy - Math.floor(toNum(skill.cost, 0)));
    const opp = otherSide(side);
    const target = this.sideState(st, opp).active;
    const casterDef = getSprite(this.bundle, caster.spriteId);

    const ctx = new EffectContext({
      state: st,
      bundle: this.bundle,
      rng,
      casterSide: side,
      targetSide: opp,
      defenderAction,
      firstStrike,
    });
    applyOps(skill.ops as never, ctx);
    const events = [...ctx.events];

    const category = toStr(skill.category);
    const power = toNum(skill.power, 0);
    if ((category === "Physical" || category === "Magic") && power > 0 && target.hp > 0) {
      const targetDef = getSprite(this.bundle, target.spriteId);
      const result = computeDamage(this.bundle, casterDef, targetDef, caster, target, skill, {
        weatherId: st.weather ? st.weather.id : null,
        extraMult: ctx.extraDamageMult,
        rng,
      });
      target.hp = Math.max(0, target.hp - result.damage);
      events.push({
        type: "damage",
        side: opp,
        text: `${caster.spriteId} 对 ${target.spriteId} 造成 ${result.damage} 伤害${result.crit ? "（暴击）" : ""}`,
        data: { value: result.damage, crit: result.crit },
      });
    }
    return events;
  }

  private decay(st: BattleState): void {
    if (st.weather) {
      st.weather.turnsLeft -= 1;
      if (st.weather.turnsLeft <= 0) st.weather = null;
    }
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      if (s.wishCooldown > 0) s.wishCooldown -= 1;
      for (const sprite of [s.active, ...s.bench]) {
        for (const status of Object.keys({ ...sprite.statuses })) {
          sprite.statuses[status] -= 1;
          if (sprite.statuses[status] <= 0) delete sprite.statuses[status];
        }
      }
    }
  }

  /** 记录阵亡并扣魔力；不自动换人（由玩家确认上场精灵）。 */
  handleFaints(st: BattleState): BattleEvent[] {
    const events: BattleEvent[] = [];
    const perFaint = Math.floor(toNum(asDict(this.bundle.rules.magic).perFaint, 1));
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      if (s.active.hp > 0) continue;
      s.magic -= perFaint;
      events.push({ type: "faint", side, text: `${s.active.spriteId} 阵亡，魔力 -${perFaint}`, data: {} });
    }
    return events;
  }

  forcedSwitch(st: BattleState, side: Side, benchId: string | null): BattleEvent[] {
    return this.doSwitch(st, side, benchId ?? undefined);
  }

  // ------------------------------------------------------------------ 终止
  terminal(state: BattleState): Terminal {
    const { player: p, enemy: e } = state;
    if (p.magic <= 0) return { ended: true, winner: "enemy", reason: "我方魔力耗尽" };
    if (e.magic <= 0) return { ended: true, winner: "player", reason: "敌方魔力耗尽" };
    if (![p.active, ...p.bench].some((s) => s.hp > 0)) return { ended: true, winner: "enemy", reason: "我方精灵全部阵亡" };
    if (![e.active, ...e.bench].some((s) => s.hp > 0)) return { ended: true, winner: "player", reason: "敌方精灵全部阵亡" };
    return { ended: false, winner: null, reason: "" };
  }

  applyLeader(st: BattleState, side: Side): BattleEvent[] {
    const s = this.sideState(st, side);
    if (s.leaderUsed) return [];
    s.leaderUsed = true;
    const boost = toNum(asDict(this.bundle.rules.leader).attackBoost, 0);
    if (boost) {
      s.active.buffs.atk = toNum(s.active.buffs.atk, 0) + boost;
      s.active.buffs.spatk = toNum(s.active.buffs.spatk, 0) + boost;
    }
    return [{ type: "leader", side, text: `${side} 首领化`, data: {} }];
  }
}
