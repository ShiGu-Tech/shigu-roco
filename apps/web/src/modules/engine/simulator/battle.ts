/** 战斗模拟器（MDP 环境）：按四阶段回合结算。对应 Python simulator/battle.py。 */

import { getSkill, getSprite } from "../data";
import { effectiveStat } from "../effects/damage";
import type { Rng } from "../rng";
import { cloneState } from "../state";
import type { Action, BattleEvent, BattleState, DataBundle, Side, StepResult, Terminal } from "../types";
import { asDict, toArray, toNum, toStr } from "../types";
import { clearMarksOnSwitch, settleMarks } from "./marks";
import { ActionQueue, MechanismRegistry, MechanismRuntime, mechanismsFromData } from "../mechanisms";

const SIDES: Side[] = ["player", "enemy"];

function otherSide(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

export class Simulator {
  readonly bundle: DataBundle;
  readonly mechanisms: MechanismRuntime;

  constructor(bundle: DataBundle) {
    this.bundle = bundle;
    this.mechanisms = new MechanismRuntime(new MechanismRegistry(mechanismsFromData(bundle.mechanisms)));
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
      if (toNum(skill.cost, 0) <= active.energy && toNum(active.cooldowns?.[skillId], 0) <= 0) {
        actions.push({ kind: "skill", skillId, label: toStr(skill.skillName, skillId) });
      }
    }

    if (side.switchLock <= 0) {
      for (const bench of side.bench) {
        if (bench.hp > 0 && bench.spriteId !== active.spriteId) {
          actions.push({ kind: "switch", benchId: bench.spriteId, label: `换 ${bench.spriteId}` });
        }
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

    const turnStartCommands = this.mechanisms.dispatch({ state: st, trigger: "turnStart", event: { turn: st.turn } });
    events.push(...this.mechanisms.applyStateCommands(st, turnStartCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));

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
      events.push(...this.doSwitch(st, side, actions[side].benchId, false));
      logs.push(`switch: ${side} -> ${actions[side].benchId ?? ""}`);
    }

    // ③ 精灵技能阶段（含聚能）：先发布 actionDeclared，再由扩展层修改行动队列。
    const queue = new ActionQueue();
    const actionIds: Record<Side, string> = { player: `action-${st.turn}-player`, enemy: `action-${st.turn}-enemy` };
    const actorSides = SIDES.filter((s) => actions[s].kind === "skill" || actions[s].kind === "energy");
    actorSides.forEach((side, index) => {
      const [priority, speed] = this.orderKey(st, side, actions[side]);
      queue.enqueue({ id: actionIds[side], actorSide: side, action: actions[side], declaredAt: index, priority, speedSnapshot: speed, status: "queued" });
    });
    for (const side of actorSides) {
      const commands = this.mechanisms.dispatch({
        state: st,
        trigger: "actionDeclared",
        actorSide: side,
        targetSide: otherSide(side),
        action: actions[side],
        event: { action: actions[side], actionId: actionIds[side] },
      });
      const mechanismEvents = this.mechanisms.applyActionCommands(queue, commands, actionIds, () => `action-${st.turn}-extra-${queue.all().length}`);
      events.push(...mechanismEvents.map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      const stateEvents = this.mechanisms.applyStateCommands(st, commands, this.bundle);
      events.push(...stateEvents.map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    }
    queue.ordered().forEach((entry) => {
      if (entry.status !== "queued") return;
      const side = entry.actorSide;
      const caster = this.sideState(st, side).active;
      if (caster.hp <= 0) return;
      const beforeCommands = this.mechanisms.dispatch({
        state: st,
        trigger: "beforeAction",
        actorSide: side,
        targetSide: otherSide(side),
        action: entry.action,
        event: { action: entry.action, actionId: entry.id },
      });
      events.push(...this.mechanisms.applyActionCommands(queue, beforeCommands, { ...actionIds, [side]: entry.id }, () => `action-${st.turn}-extra-${queue.all().length}`).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      events.push(...this.mechanisms.applyStateCommands(st, beforeCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      if (entry.status !== "queued") return;
      entry.status = "executing";
      const opp = otherSide(side);
      if (entry.action.kind === "energy") {
        events.push(...this.applyEnergy(st, side));
        logs.push(`energy: ${side}`);
      } else {
        events.push(...this.executeSkill(st, side, entry.action, rng, beforeCommands));
        logs.push(`skill: ${side} -> ${entry.action.skillId ?? ""}`);
      }
      entry.status = "resolved";
      const afterCommands = this.mechanisms.dispatch({
        state: st,
        trigger: "actionResolved",
        actorSide: side,
        targetSide: opp,
        action: entry.action,
        event: { action: entry.action, actionId: entry.id },
      });
      events.push(...this.mechanisms.applyStateCommands(st, afterCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    });

    // ④ 结算阶段
    const turnEndCommands = this.mechanisms.dispatch({ state: st, trigger: "turnEnd", event: { turn: st.turn } });
    events.push(...this.mechanisms.applyStateCommands(st, turnEndCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    events.push(...settleMarks(st, "turnEnd", this.bundle));
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

  private asBattleEvent(type: string, side: Side | null, event: { data: Record<string, unknown>; mechanismId?: string; effectType?: string }): BattleEvent {
    return {
      type,
      side,
      text: event.mechanismId ? `机制 ${event.mechanismId}：${type}` : type,
      data: { ...event.data, mechanismId: event.mechanismId, effectType: event.effectType },
    };
  }

  private triggerMarkMechanisms(st: BattleState, carrierSide: Side, targetSide: Side): BattleEvent[] {
    const carrier = this.sideState(st, carrierSide);
    const markIds = new Set([...Object.keys(carrier.active.marks), ...Object.keys(carrier.teamMarks)]);
    const events: BattleEvent[] = [];
    for (const markId of markIds) {
      const stack = carrier.teamMarks[markId] ?? carrier.active.marks[markId] ?? 0;
      const commands = this.mechanisms.dispatch({ state: st, trigger: "onHit", actorSide: carrierSide, targetSide, event: { markId, stack } });
      events.push(...this.mechanisms.applyStateCommands(st, commands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      events.push(...this.mechanisms.applyDamageCommands(st, this.bundle, commands).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    }
    return events;
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

  doSwitch(st: BattleState, side: Side, benchId?: string, forced = false): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideState(st, side);
    if (!forced && s.switchLock > 0) return events;
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
    rng: Rng,
    commands: import("../mechanisms").EffectCommand[],
  ): BattleEvent[] {
    const skill = action.skillId ? getSkill(this.bundle, action.skillId) : {};
    const caster = this.sideState(st, side).active;
    caster.energy = Math.max(0, caster.energy - Math.floor(toNum(skill.cost, 0)));
    const cooldown = Math.max(0, Math.floor(toNum(skill.cooldown, 0)));
    if (action.skillId && cooldown > 0) {
      caster.cooldowns ??= {};
      caster.cooldowns[action.skillId] = cooldown;
    }
    const opp = otherSide(side);
    const target = this.sideState(st, opp).active;
    const events: BattleEvent[] = [];
    const damageCommands = commands.filter((command) => command.definition.type === "dealDamage");
    if (damageCommands.length && target.hp > 0) {
      const category = toStr(skill.category);
      const beforeDamage = this.mechanisms.dispatch({
        state: st,
        trigger: "beforeDamage",
        actorSide: side,
        targetSide: opp,
        action,
        event: { action, skillId: action.skillId, damageType: category },
      });
      events.push(...this.mechanisms.applyStateCommands(st, beforeDamage, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      events.push(...this.mechanisms.applyDamageCommands(st, this.bundle, damageCommands).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      events.push(...this.triggerMarkMechanisms(st, opp, side));
      const afterDamage = this.mechanisms.dispatch({
        state: st,
        trigger: "afterDamage",
        actorSide: side,
        targetSide: opp,
        action,
        event: { action, skillId: action.skillId, damageType: category },
      });
      events.push(...this.mechanisms.applyStateCommands(st, afterDamage, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
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
        for (const skillId of Object.keys(sprite.cooldowns ?? {})) {
          sprite.cooldowns![skillId] -= 1;
          if (sprite.cooldowns![skillId] <= 0) delete sprite.cooldowns![skillId];
        }
        for (const status of Object.keys({ ...sprite.statuses })) {
          sprite.statuses[status] -= 1;
          if (sprite.statuses[status] <= 0) delete sprite.statuses[status];
        }
      }
      if (s.switchLock > 0) s.switchLock -= 1;
    }
  }

  /** 记录阵亡并扣魔力；不自动换人（由玩家确认上场精灵）。 */
  handleFaints(st: BattleState): BattleEvent[] {
    const events: BattleEvent[] = [];
    const perFaint = Math.floor(toNum(asDict(this.bundle.rules.magic).perFaint, 1));
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      if (s.active.hp > 0 || s.active.faintHandled) continue;
      s.active.faintHandled = true;
      s.magic -= perFaint;
      events.push({ type: "faint", side, text: `${s.active.spriteId} 阵亡，魔力 -${perFaint}`, data: {} });
    }
    return events;
  }

  forcedSwitch(st: BattleState, side: Side, benchId: string | null): BattleEvent[] {
    return this.doSwitch(st, side, benchId ?? undefined, true);
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
