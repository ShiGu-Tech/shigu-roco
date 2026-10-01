/** 战斗模拟器（MDP 环境）：按四阶段回合结算。对应 Python simulator/battle.py。 */

import { bundleTypeMultiplier, getSkill, getSprite } from "../data";
import { effectiveStat } from "../effects/damage";
import { statWithProfile } from "../stats";
import type { Rng } from "../rng";
import { cloneState, expireSkillOverrides, revertSkillOverride } from "../state";
import type { Action, BattleEvent, BattleState, DataBundle, Side, StepResult, Terminal } from "../types";
import { asDict, toArray, toNum, toStr } from "../types";
import { clearMarksOnSwitch } from "./marks";
import { clearStatusesOnSwitch } from "./status";
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
    /** 本回合被置/改/使用的技能，冷却结算时跳过（净 ±N，避免刚置就被 tick）。 */
    const touched: Record<Side, Set<string>> = { player: new Set(), enemy: new Set() };

    if (st.turn === 1) {
      events.push(...this.triggerState(st, "battleStart", { event: { turn: st.turn } }));
    }

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
    // 应对成功：本技能有「应对 X」且敌方本回合使用 X 类行动 → 必定先手（优先级抬升）。
    const reactedBySide: Partial<Record<Side, boolean>> = {};
    for (const side of actorSides) reactedBySide[side] = this.reactSuccess(actions[side].skillId, actions[otherSide(side)]);
    actorSides.forEach((side, index) => {
      const [basePriority, speed] = this.orderKey(st, side, actions[side]);
      const priority = reactedBySide[side] ? basePriority + 100 : basePriority;
      queue.enqueue({ id: actionIds[side], actorSide: side, action: actions[side], declaredAt: index, priority, speedSnapshot: speed, status: "queued" });
    });
    for (const side of actorSides) {
      const opponentAction = actions[otherSide(side)];
      const opponentSkill = opponentAction.kind === "skill" && opponentAction.skillId ? getSkill(this.bundle, opponentAction.skillId) : {};
      const commands = this.mechanisms.dispatch({
        state: st,
        trigger: "actionDeclared",
        actorSide: side,
        targetSide: otherSide(side),
        action: actions[side],
        event: {
          action: actions[side],
          actionId: actionIds[side],
          reaction: this.reactionOf(actions[side].skillId),
          reacted: reactedBySide[side] === true,
          opponentAction: { kind: opponentAction.kind, skillId: opponentAction.skillId, actionType: toStr(opponentSkill.actionType), category: toStr(opponentSkill.category) },
        },
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
        event: { action: entry.action, actionId: entry.id, reacted: reactedBySide[side] === true },
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
      if (entry.action.kind === "skill") {
        if (entry.action.skillId) touched[side].add(entry.action.skillId);
        const usedSkill = entry.action.skillId ? getSkill(this.bundle, entry.action.skillId) : {};
        events.push(...this.triggerState(st, "skillUsed", { actorSide: side, targetSide: opp, action: entry.action, event: { skillId: entry.action.skillId, actionId: entry.id, element: toStr(usedSkill.element), category: toStr(usedSkill.category), actionType: toStr(usedSkill.actionType), reacted: reactedBySide[side] === true } }));
        const skillId = entry.action.skillId;
        if (skillId && caster.skillOverrides?.[skillId]?.expires === 0) {
          revertSkillOverride(caster, skillId);
          events.push({ type: "skill-reverted", side, text: `${caster.spriteId} 使用后还原技能 ${skillId}`, data: { skillId } });
        }
      }
      const afterCommands = this.mechanisms.dispatch({
        state: st,
        trigger: "actionResolved",
        actorSide: side,
        targetSide: opp,
        action: entry.action,
        event: { action: entry.action, actionId: entry.id, reacted: reactedBySide[side] === true },
      });
      events.push(...this.mechanisms.applyStateCommands(st, afterCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    });

    // ④ 结算阶段：按侧状态 / 印记结算（DoT、衰减）→ 环境衰减 → 阵亡
    for (const side of SIDES) {
      events.push(...this.triggerState(st, "turnEnd", { actorSide: side, targetSide: otherSide(side), event: { turn: st.turn, side } }));
    }
    for (const event of events) {
      if (event.type === "cooldown-modified" && event.side) {
        const skillId = toStr(event.data.skillId);
        if (skillId) touched[event.side].add(skillId);
      }
    }
    this.decay(st, touched);
    events.push(...this.handleFaints(st));

    // 记忆域：记录本回合双方动作，供「若上回合…」类条件（下一个回合读取）。
    for (const side of SIDES) {
      const action = actions[side];
      const s = this.sideState(st, side);
      if (action.kind === "skill" && action.skillId) {
        const used = getSkill(this.bundle, action.skillId);
        s.lastTurn = { skillId: action.skillId, category: toStr(used.category), actionType: toStr(used.actionType), element: toStr(used.element), reacted: reactedBySide[side] === true };
      } else if (action.kind === "energy") {
        s.lastTurn = { actionType: "Energy" };
      } else {
        s.lastTurn = { switched: true };
      }
    }

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

  /** 技能的行动类型（用于「应对」判定）。 */
  private actionTypeOf(action: Action): string {
    if (action.kind === "skill" && action.skillId) return toStr(getSkill(this.bundle, action.skillId).actionType, "Attack");
    if (action.kind === "energy") return "Energy";
    if (action.kind === "switch") return "Switch";
    return "Status";
  }

  /** 技能声明的「应对」类型：站点描述内联标签 1015 应对状态 / 1016 应对攻击 / 1017 应对防御。 */
  private reactionOf(skillId: string | undefined): string | null {
    if (!skillId) return null;
    const raw = toStr(asDict(getSkill(this.bundle, skillId).sourceData).description);
    const match = raw.match(/<desc_id=(1015|1016|1017)>/);
    return match ? ({ "1015": "Status", "1016": "Attack", "1017": "Defense" } as Record<string, string>)[match[1]] : null;
  }

  /** 应对成功：本技能有「应对 X」且敌方本回合使用了 X 类行动。 */
  private reactSuccess(skillId: string | undefined, opponentAction: Action): boolean {
    const reaction = this.reactionOf(skillId);
    return !!reaction && reaction === this.actionTypeOf(opponentAction);
  }

  private asBattleEvent(type: string, side: Side | null, event: { data: Record<string, unknown>; mechanismId?: string; effectType?: string }): BattleEvent {
    return {
      type,
      side,
      text: event.mechanismId ? `机制 ${event.mechanismId}：${type}` : type,
      data: { ...event.data, mechanismId: event.mechanismId, effectType: event.effectType },
    };
  }

  /** 发布一个生命周期事件并应用扩展命令（状态 + 伤害），供 battleStart/换人/技能/死亡等触发点复用。 */
  private triggerState(
    st: BattleState,
    trigger: import("../mechanisms").TriggerName,
    options: { actorSide?: Side; targetSide?: Side; action?: Action; event?: Record<string, unknown> } = {},
  ): BattleEvent[] {
    const commands = this.mechanisms.dispatch({
      state: st,
      trigger,
      actorSide: options.actorSide,
      targetSide: options.targetSide,
      action: options.action,
      event: options.event ?? {},
    });
    const events: BattleEvent[] = [];
    for (const event of this.mechanisms.applyStateCommands(st, commands, this.bundle)) {
      events.push(this.asBattleEvent(event.type, event.side ?? null, event));
    }
    for (const event of this.mechanisms.applyDamageCommands(st, this.bundle, commands)) {
      events.push(this.asBattleEvent(event.type, event.side ?? null, event));
    }
    return events;
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

  /** 星陨追加伤害（roco pet – RocoDiviner 图卡 4）：非幻系攻击技命中带「星陨印记」目标时引爆，消耗全部层数。
   * 伤害 = floor( round(攻 × 星陨威力 × 幻系克制 × 特性 × 强化差值 × 37/41) ÷ 防 ) × 减伤；星陨威力 = N²+24N−24。
   * 攻/防取触发技的物/魔类别；特性倍率与减伤暂按 1（特性表未校准）。 */
  private applyStarfall(st: BattleState, attackerSide: Side, defenderSide: Side, skillId?: string): BattleEvent[] {
    const cfg = asDict(this.bundle.rules.starfall);
    const element = toStr(cfg.element) || "Psychic";
    const skill = skillId ? getSkill(this.bundle, skillId) : {};
    if (toStr(skill.element) === element) return [];
    const category = toStr(skill.category);
    if (category !== "Physical" && category !== "Magic") return [];

    const defender = this.sideState(st, defenderSide).active;
    const stacks = Math.floor(toNum(defender.marks?.["starfall-mark"], 0));
    if (stacks <= 0 || defender.hp <= 0) return [];

    const attacker = this.sideState(st, attackerSide).active;
    const attackerDef = getSprite(this.bundle, attacker.spriteId);
    const defenderDef = getSprite(this.bundle, defender.spriteId);

    const power = asDict(cfg.power);
    const starPower = toNum(power.quad, 1) * stacks * stacks + toNum(power.linear, 24) * stacks + toNum(power.constant, -24);

    const magical = category === "Magic";
    const atkStat = magical ? "spatk" : "atk";
    const defStat = magical ? "spdef" : "defense";
    const atk = statWithProfile(this.bundle.stats, attackerDef, attacker.profile, atkStat);
    const dfn = Math.max(1, statWithProfile(this.bundle.stats, defenderDef, defender.profile, defStat));
    const typeMult = bundleTypeMultiplier(this.bundle, element, (defenderDef.elements as string[] | undefined) ?? []);
    const stageMult = 1 + toNum(attacker.buffs[atkStat], 0) + toNum(attacker.debuffs[atkStat], 0) - toNum(defender.buffs[defStat], 0) - toNum(defender.debuffs[defStat], 0);
    const balance = toNum(asDict(this.bundle.rules.damageFormula).balance, 37 / 41);
    const damage = Math.max(0, Math.floor(Math.round(atk * starPower * typeMult * stageMult * balance) / dfn));

    delete defender.marks["starfall-mark"];
    defender.hp = Math.max(0, defender.hp - damage);
    return [{ type: "starfall", side: defenderSide, text: `${defender.spriteId} 星陨引爆 ${stacks} 层 → 追加 ${damage}`, data: { stacks, damage, starPower, typeMult } }];
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
    const old = s.active;
    events.push(...this.triggerState(st, "beforeSwitch", { actorSide: side, targetSide: otherSide(side), action: { kind: "switch", benchId }, event: { from: old.spriteId, to: target.spriteId, forced } }));
    events.push(...clearMarksOnSwitch(st, side, this.bundle));
    events.push(...clearStatusesOnSwitch(st, side, this.bundle));
    s.bench = s.bench.filter((b) => b !== target);
    s.bench.push(old);
    s.active = target;
    s.forcedSwitch = false;
    events.push({ type: "switch", side, text: `${side} 换上 ${target.spriteId}`, data: { forced } });
    events.push(...this.triggerState(st, "afterSwitch", { actorSide: side, targetSide: otherSide(side), action: { kind: "switch", benchId }, event: { from: old.spriteId, to: target.spriteId, forced } }));
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
    const costDelta = toNum(action.skillId ? caster.skillMods?.[action.skillId]?.cost : 0, 0);
    caster.energy = Math.max(0, caster.energy - Math.max(0, Math.floor(toNum(skill.cost, 0) + costDelta)));
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
      events.push(...this.triggerState(st, "onHit", { actorSide: side, targetSide: opp, action, event: { skillId: action.skillId, damageType: category } }));
      events.push(...this.triggerMarkMechanisms(st, opp, side));
      events.push(...this.applyStarfall(st, side, opp, action.skillId));
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

  private decay(st: BattleState, touched: Record<Side, Set<string>>): void {
    if (st.weather) {
      st.weather.turnsLeft -= 1;
      if (st.weather.turnsLeft <= 0) st.weather = null;
    }
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      if (s.wishCooldown > 0) s.wishCooldown -= 1;
      // 冷却按精灵「占场消耗」：只结算在场精灵；下场（bench）冻结，换回后从剩余值继续。
      const active = s.active;
      for (const skillId of Object.keys(active.cooldowns ?? {})) {
        if (touched[side].has(skillId)) continue;
        active.cooldowns![skillId] -= 1;
        if (active.cooldowns![skillId] <= 0) delete active.cooldowns![skillId];
      }
      for (const sprite of [active, ...s.bench]) expireSkillOverrides(sprite, st.turn);
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
      const opp = otherSide(side);
      events.push(...this.triggerState(st, "beforeDeath", { actorSide: side, targetSide: opp, event: { spriteId: s.active.spriteId } }));
      s.active.faintHandled = true;
      s.magic -= perFaint;
      events.push({ type: "faint", side, text: `${s.active.spriteId} 阵亡，魔力 -${perFaint}`, data: {} });
      events.push(...this.triggerState(st, "afterDeath", { actorSide: side, targetSide: opp, event: { spriteId: s.active.spriteId } }));
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
