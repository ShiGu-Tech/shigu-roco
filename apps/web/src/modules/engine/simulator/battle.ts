/** 战斗模拟器（MDP 环境）：按四阶段回合结算。对应 Python simulator/battle.py。 */

import { effectiveCost } from "../cost";
import { getSkill, getSprite } from "../data";
import { computeDamage, effectiveStat } from "../effects/damage";
import type { Rng } from "../rng";
import { cloneState, expireSkillOverrides, revertSkillOverride } from "../state";
import type { Action, BattleEvent, BattleState, DataBundle, Side, StepResult, Terminal } from "../types";
import { asDict, toArray, toNum, toStr } from "../types";
import { clearMarksOnSwitch } from "./marks";
import { clearStatusesOnSwitch } from "./status";
import { ActionQueue, MechanismRuntime, type MechanismSource } from "../mechanisms";
import { programCollectorFor } from "../graph";

const SIDES: Side[] = ["player", "enemy"];

function otherSide(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

export class Simulator {
  readonly bundle: DataBundle;
  readonly mechanisms: MechanismRuntime;

  /** `mechanisms` 默认 = **程序源**（G2b-1.5 AND 脊门控后与 DSL 同量级：collect +17% / step +10%，
   *  等价由 `program-collect.test` 逐命令 + 整场同种子 A/B、`relevance.test` soundness 守卫）；
   *  测试可注入 `MechanismRegistry` 做 A/B 对照（`new Simulator(bundle, dslSource)`）。 */
  constructor(bundle: DataBundle, mechanisms?: MechanismSource) {
    this.bundle = bundle;
    this.mechanisms = new MechanismRuntime(mechanisms ?? programCollectorFor(bundle));
  }

  private sideState(state: BattleState, who: Side) {
    return who === "player" ? state.player : state.enemy;
  }

  /** 队伍域 · 计数器自增（`SideState.counters`）。 */
  private bump(st: BattleState, side: Side, key: string, delta = 1): void {
    const s = this.sideState(st, side);
    s.counters ??= {};
    s.counters[key] = toNum(s.counters[key], 0) + delta;
  }

  /** 队伍/全场域 · 派生计数刷新：`teamMoe`（队伍萌化合计）、`fieldMarkKinds` / `fieldBuffKinds`（双方场上印记 / 增益种类）。
   *  在这些值变化后调用（回合开始 / 换人 / 行动段结束）。 */
  private refreshDerivedCounters(st: BattleState): void {
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      s.counters ??= {};
      let moe = 0;
      for (const sprite of [s.active, ...s.bench]) moe += toNum(sprite.statuses.moe, 0);
      s.counters.teamMoe = moe;
    }
    const markKinds = new Set<string>();
    const buffKinds = new Set<string>();
    for (const side of SIDES) {
      const a = this.sideState(st, side).active;
      for (const [k, v] of Object.entries(a.marks)) if (toNum(v, 0) > 0) markKinds.add(k);
      for (const [k, v] of Object.entries(a.buffs)) if (toNum(v, 0) > 0) buffKinds.add(k);
    }
    for (const side of SIDES) {
      const c = this.sideState(st, side).counters!;
      c.fieldMarkKinds = markKinds.size;
      c.fieldBuffKinds = buffKinds.size;
    }
  }

  /** 预警域 · 估算对手当前是否能一击带走自己（用对手携带的攻击技能最大伤害对比自身生命），
   *  写 `counters.incomingLethal`（0/1）。口径为近似，供「若敌方技能足够击败自己」类（预警 / 先知 / 哨兵）。 */
  private estimateIncomingLethal(st: BattleState, side: Side): void {
    const self = this.sideState(st, side).active;
    const opp = this.sideState(st, otherSide(side)).active;
    const selfDef = getSprite(this.bundle, self.spriteId);
    const oppDef = getSprite(this.bundle, opp.spriteId);
    const oppLoadout = opp.loadout.length
      ? opp.loadout
      : (toArray<string>(oppDef.loadout).length ? toArray<string>(oppDef.loadout) : toArray<string>(oppDef.skillList));
    let max = 0;
    for (const skillId of oppLoadout) {
      const skill = getSkill(this.bundle, skillId);
      if (skill.category !== "Physical" && skill.category !== "Magic") continue;
      if (!(toNum(skill.power, 0) > 0)) continue;
      const res = computeDamage(this.bundle, oppDef, selfDef, opp, self, skill, { weatherId: st.weather?.id ?? null });
      if (res.damage > max) max = res.damage;
    }
    const s = this.sideState(st, side);
    s.counters ??= {};
    s.counters.incomingLethal = max >= self.hp ? 1 : 0;
  }

  /** 队伍域 · 开局按图鉴预计算：队伍各系只数 `team<Element>`、携带各系技能数 `loadout<Element>`、
   *  携带技能总能耗 `loadoutCost`、携带系别种数 `loadoutElements`。 */
  private seedSideCounters(st: BattleState, side: Side): void {
    const s = this.sideState(st, side);
    s.counters ??= {};
    const c = s.counters;
    for (const sprite of [s.active, ...s.bench]) {
      const def = getSprite(this.bundle, sprite.spriteId);
      for (const el of toArray<string>(def.elements)) c[`team${el}`] = toNum(c[`team${el}`], 0) + 1;
    }
    const def = getSprite(this.bundle, s.active.spriteId);
    const loadout = s.active.loadout.length
      ? s.active.loadout
      : (toArray<string>(def.loadout).length ? toArray<string>(def.loadout) : toArray<string>(def.skillList));
    const elements = new Set<string>();
    let totalCost = 0;
    for (const skillId of loadout) {
      const sk = getSkill(this.bundle, skillId);
      const el = toStr(sk.element);
      if (el) { c[`loadout${el}`] = toNum(c[`loadout${el}`], 0) + 1; elements.add(el); }
      totalCost += toNum(sk.cost, 0);
    }
    c.loadoutCost = totalCost;
    c.loadoutElements = elements.size;
    // 图鉴域 · 携带系别集合（供「受到自己携带技能系别」类条件）。
    s.active.carryElements = [...elements];
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
    // 技能栏域 · 槽位限制（特性经 `setRuleModifier "battle.allowedSlots"` 声明可用槽位位掩码：bit0=1号位…）。
    const ruleMods = this.mechanisms.ruleModifiers(state, this.bundle, who);
    const slotMask = typeof ruleMods["battle.allowedSlots"] === "number" ? (ruleMods["battle.allowedSlots"] as number) : 0;
    for (let slot = 0; slot < loadout.length; slot++) {
      if (slotMask && !(slotMask & (1 << slot))) continue;
      const skillId = loadout[slot];
      const skill = getSkill(this.bundle, skillId);
      const skillCost = effectiveCost(state, this.bundle, who, skillId, ruleMods);
      const affordable = skillCost <= active.energy || (ruleMods["cost.payWithHp"] === true && active.hp > 0);
      if (affordable && toNum(active.cooldowns?.[skillId], 0) <= 0) {
        const name = toStr(skill.skillName, skillId);
        // 选择技（描述含「选择：」）：列出「明 / 暗」两个分支。
        if (/选择/.test(toStr(skill.description, ""))) {
          actions.push({ kind: "skill", skillId, choice: 0, label: `${name} · 明` });
          actions.push({ kind: "skill", skillId, choice: 1, label: `${name} · 暗` });
        } else {
          actions.push({ kind: "skill", skillId, label: name });
        }
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
    // 蓄力域：已蓄力的技能下回合自动释放（占用该侧行动，忽略输入）；在场者阵亡则清除蓄力。
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      const pending = s.active.pendingSkill;
      if (!pending) continue;
      if (s.active.hp > 0) actions[side] = { kind: "skill", skillId: pending.skillId, choice: pending.choice, released: true, label: "蓄力释放" };
      else s.active.pendingSkill = undefined;
    }
    const rules = this.bundle.rules;
    /** 本回合被置/改/使用的技能，冷却结算时跳过（净 ±N，避免刚置就被 tick）。 */
    const touched: Record<Side, Set<string>> = { player: new Set(), enemy: new Set() };
    // 回合开始清空「本回合是否换人」标记与 `oncePerTurn` 计数。
    for (const side of SIDES) this.sideState(st, side).switchedThisTurn = false;
    st.onceFired = {};
    // 图鉴域 · 系别 / 血脉注入：从图鉴取系别、从培养资质取血脉写入运行时精灵。
    // 血脉取值为「系别名（如 Grass）」或固定项「leader / polluted / strange」（UI 约定）。
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      for (const sprite of [s.active, ...s.bench]) {
        const def = getSprite(this.bundle, sprite.spriteId);
        if (!sprite.element) sprite.element = toArray<string>(def.elements);
        const key = toStr(sprite.profile?.bloodline);
        if (key) {
          sprite.bloodline = key;
          sprite.bloodlineElement = key === "leader" || key === "polluted" || key === "strange" ? "" : key;
        }
      }
    }

    if (st.turn === 1) {
      // 入场域：开局在场精灵各自「入场」一次（供「首次入场」类特性）。
      for (const side of SIDES) events.push(...this.enterField(st, side, { from: null, forced: false }));
      events.push(...this.triggerState(st, "battleStart", { event: { turn: st.turn } }));
      // 队伍域 · 开局按图鉴预计算队伍 / 携带统计（供「队伍每有 1 只 X 系」「每携带 1 个 X 系技能」类特性）。
      for (const side of SIDES) this.seedSideCounters(st, side);
    }

    // 技能栏域 · 传动：turnStart 按侧派发，使 `self.active.loadout` 类条件可取到自身（与 turnEnd 一致）。
    for (const side of SIDES) {
      const turnStartCommands = this.mechanisms.dispatch({ state: st, trigger: "turnStart", actorSide: side, targetSide: otherSide(side), event: { turn: st.turn, side } });
      events.push(...this.mechanisms.applyStateCommands(st, turnStartCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    }
    events.push(...this.runPendingEffects(st, "turnStart"));
    this.refreshDerivedCounters(st);
    for (const side of SIDES) this.estimateIncomingLethal(st, side);

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
      this.sideState(st, side).switchedThisTurn = true;
      logs.push(`switch: ${side} -> ${actions[side].benchId ?? ""}`);
    }
    // 迅捷（术语 1005）：主动换人入场 → 立刻使用第一个能量足够、带「迅捷」tag 的技能（照常入队拼速）。
    const quickActions: Partial<Record<Side, Action>> = {};
    for (const side of switchSides) {
      const active = this.sideState(st, side).active;
      const ruleMods = this.mechanisms.ruleModifiers(st, this.bundle, side);
      for (const skillId of active.loadout) {
        const skill = getSkill(this.bundle, skillId);
        if (!toArray<string>(skill.tags).includes("quick")) continue;
        if (effectiveCost(st, this.bundle, side, skillId, ruleMods) > active.energy) continue;
        quickActions[side] = { kind: "skill", skillId, label: "迅捷" };
        break;
      }
    }

    // ③ 精灵技能阶段（含聚能）：先发布 actionDeclared，再由扩展层修改行动队列。
    const queue = new ActionQueue();
    const actionIds: Record<Side, string> = { player: `action-${st.turn}-player`, enemy: `action-${st.turn}-enemy` };
    const actorSides = SIDES.filter((s) => actions[s].kind === "skill" || actions[s].kind === "energy");
    // 应对成功：本技能有「应对 X」且敌方本回合使用 X 类行动 → 必定先手（优先级抬升）。
    const reactedBySide: Partial<Record<Side, boolean>> = {};
    for (const side of actorSides) reactedBySide[side] = this.reactSuccess(actions[side].skillId, actions[otherSide(side)]);
    // 技能栏域 · 防御共享冷却（术语 1016「应对攻击」）：使用防御技能后，携带的全部防御技能进入 1 回合冷却。
    for (const side of actorSides) {
      const declared = actions[side];
      if (declared.kind !== "skill" || !declared.skillId) continue;
      if (toStr(getSkill(this.bundle, declared.skillId).actionType) !== "Defense") continue;
      const active = this.sideState(st, side).active;
      active.cooldowns ??= {};
      let count = 0;
      for (const id of active.loadout) {
        if (toStr(getSkill(this.bundle, id).actionType) !== "Defense") continue;
        const before = toNum(active.cooldowns[id], 0);
        active.cooldowns[id] = Math.max(before, 1);
        touched[side].add(id);
        if (active.cooldowns[id] > before) count += 1;
      }
      if (count > 0) events.push({ type: "defense-cooldown", side, text: `${side} 携带的防御技能进入 1 回合冷却`, data: { count } });
    }
    actorSides.forEach((side, index) => {
      const [basePriority, speed] = this.orderKey(st, side, actions[side]);
      const priority = reactedBySide[side] ? basePriority + 100 : basePriority;
      queue.enqueue({ id: actionIds[side], actorSide: side, action: actions[side], declaredAt: index, priority, speedSnapshot: speed, status: "queued" });
    });
    const quickSides = SIDES.filter((s) => quickActions[s]);
    const declaredActions: { side: Side; action: Action; id: string }[] = actorSides.map((side) => ({ side, action: actions[side], id: actionIds[side] }));
    for (const [i, side] of quickSides.entries()) {
      const action = quickActions[side]!;
      reactedBySide[side] = this.reactSuccess(action.skillId, actions[otherSide(side)]);
      const [basePriority, speed] = this.orderKey(st, side, action);
      const id = `action-${st.turn}-quick-${side}`;
      declaredActions.push({ side, action, id });
      queue.enqueue({ id, actorSide: side, action, declaredAt: actorSides.length + i, priority: reactedBySide[side] ? basePriority + 100 : basePriority, speedSnapshot: speed, status: "queued" });
    }
    for (const { side, action, id } of declaredActions) {
      const opponentAction = actions[otherSide(side)];
      const opponentSkill = opponentAction.kind === "skill" && opponentAction.skillId ? getSkill(this.bundle, opponentAction.skillId) : {};
      const declaredView = this.actionView(st, side, action);
      const commands = this.mechanisms.dispatch({
        state: st,
        trigger: "actionDeclared",
        actorSide: side,
        targetSide: otherSide(side),
        action: declaredView,
        event: {
          action: declaredView,
          actionId: id,
          reaction: this.reactionOf(action.skillId),
          reacted: reactedBySide[side] === true,
          opponentAction: { kind: opponentAction.kind, skillId: opponentAction.skillId, actionType: toStr(opponentSkill.actionType), category: toStr(opponentSkill.category), cost: opponentAction.skillId ? effectiveCost(st, this.bundle, otherSide(side), opponentAction.skillId, this.mechanisms.ruleModifiers(st, this.bundle, otherSide(side))) : 0 },
        },
      });
      const mechanismEvents = this.mechanisms.applyActionCommands(queue, commands, { ...actionIds, [side]: id }, () => `action-${st.turn}-extra-${queue.all().length}`);
      events.push(...mechanismEvents.map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      const stateEvents = this.mechanisms.applyStateCommands(st, commands, this.bundle);
      events.push(...stateEvents.map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    }
    // 行动时序：本回合第一个真正结算的行动记 `wentFirst`（供「若先于敌方攻击」类条件）。
    let firstResolvedSide: Side | null = null;
    queue.ordered().forEach((entry) => {
      if (entry.status !== "queued") return;
      const side = entry.actorSide;
      const caster = this.sideState(st, side).active;
      if (caster.hp <= 0) return;
      // 眩晕：本回合无法行动（计数器 `stun`，行动即消耗）。
      if (toNum(caster.counters?.stun, 0) >= 1) {
        caster.counters = { ...(caster.counters ?? {}), stun: 0 };
        entry.status = "resolved";
        events.push({ type: "stun", side, text: `${caster.spriteId} 处于眩晕，无法行动`, data: {} });
        logs.push(`stun: ${side}`);
        return;
      }
      const wentFirst = firstResolvedSide === null;
      if (wentFirst) firstResolvedSide = side;
      // 入场域 · 迸发：本次入场后的首次行动。
      const burst = !caster.actedSinceEntry;
      // 技能栏域 · 位置：暴露行动技能槽位与相邻技能威力（供「位于 N 号位」「两侧威力」类条件）。
      const actionView = this.actionView(st, side, entry.action);
      const beforeCommands = this.mechanisms.dispatch({
        state: st,
        trigger: "beforeAction",
        actorSide: side,
        targetSide: otherSide(side),
        action: actionView,
        event: { action: actionView, actionId: entry.id, reacted: reactedBySide[side] === true, wentFirst, burst },
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
        events.push(...this.executeSkill(st, side, actionView, rng, beforeCommands, reactedBySide[side] === true, wentFirst, burst));
        logs.push(`skill: ${side} -> ${entry.action.skillId ?? ""}`);
      }
      entry.status = "resolved";
      caster.actedSinceEntry = true;
      // 蓄力释放完成：清除待释放并解除离场锁。
      if (entry.action.released && caster.pendingSkill) {
        caster.pendingSkill = undefined;
        const cs = this.sideState(st, side);
        cs.switchLock = Math.max(0, (cs.switchLock ?? 0) - 1);
      }
      if (entry.action.kind === "skill") {
        if (entry.action.skillId) touched[side].add(entry.action.skillId);
        const usedSkill = entry.action.skillId ? getSkill(this.bundle, entry.action.skillId) : {};
        // 队伍域 · 历史计数：本方已使用该系 / 该类型技能次数、累计使用、成功应对次数（供「每使用过 1 次 X 系」类）。
        this.bump(st, side, `used${toStr(usedSkill.element)}`);
        this.bump(st, side, `usedType${toStr(usedSkill.actionType)}`);
        this.bump(st, side, "skillUsed");
        if (reactedBySide[side] === true) this.bump(st, side, "reacts");
        // 迅捷域 · 已使用迅捷技能的能耗累计（供「疾风连袭」动态能耗）。
        if (toArray<string>(usedSkill.tags).includes("quick")) {
          const usedCost = entry.action.skillId ? effectiveCost(st, this.bundle, side, entry.action.skillId, this.mechanisms.ruleModifiers(st, this.bundle, side)) : 0;
          this.bump(st, side, "quickCostSum", usedCost);
        }
        // 已使用过的不同系别种数（供「每使用过 1 个不同系别」类）。
        {
          const c = this.sideState(st, side).counters!;
          c.usedElementKinds = Object.keys(c).filter((k) => k.startsWith("used") && !k.startsWith("usedType") && toNum(c[k], 0) > 0).length;
        }
        events.push(...this.triggerState(st, "skillUsed", { actorSide: side, targetSide: opp, action: actionView, event: { skillId: entry.action.skillId, actionId: entry.id, element: toStr(usedSkill.element), category: toStr(usedSkill.category), actionType: toStr(usedSkill.actionType), cost: entry.action.skillId ? effectiveCost(st, this.bundle, side, entry.action.skillId, this.mechanisms.ruleModifiers(st, this.bundle, side)) : 0, reacted: reactedBySide[side] === true, wentFirst, burst } }));
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
        action: actionView,
        event: { action: actionView, actionId: entry.id, reacted: reactedBySide[side] === true, wentFirst, burst },
      });
      events.push(...this.mechanisms.applyStateCommands(st, afterCommands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    });

    // 行动段结束：刷新派生计数（供回合末 / 下文读取）。
    this.refreshDerivedCounters(st);

    // ④ 结算阶段：按侧状态 / 印记结算（DoT、衰减）→ 环境衰减 → 阵亡
    // 规则覆盖 · 回合末增删（陨落 `turnEnd.skip` / 双向光速 `turnEnd.extra`，任一侧声明即对双方生效）。
    const teModPlayer = this.mechanisms.ruleModifiers(st, this.bundle, "player");
    const teModEnemy = this.mechanisms.ruleModifiers(st, this.bundle, "enemy");
    const turnEndSkip = teModPlayer["turnEnd.skip"] === true || teModEnemy["turnEnd.skip"] === true;
    const turnEndExtra = teModPlayer["turnEnd.extra"] === true || teModEnemy["turnEnd.extra"] === true;
    if (!turnEndSkip) {
      const times = turnEndExtra ? 2 : 1;
      for (let i = 0; i < times; i++) {
        for (const side of SIDES) {
          events.push(...this.triggerState(st, "turnEnd", { actorSide: side, targetSide: otherSide(side), event: { turn: st.turn, side } }));
        }
        events.push(...this.runPendingEffects(st, "turnEnd"));
      }
    }
    // 行动域 · 返场：回合末结算后重新入场（重置迸发标记 + 派发 onEntry）。
    for (const side of SIDES) {
      const act = this.sideState(st, side).active;
      if (!act.returnedThisTurn) continue;
      act.returnedThisTurn = false;
      act.actedSinceEntry = false;
      events.push(...this.triggerState(st, "onEntry", { actorSide: side, targetSide: otherSide(side), event: { enteredSpriteId: act.spriteId, returned: true } }));
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
        s.lastTurn = { skillId: action.skillId, category: toStr(used.category), actionType: toStr(used.actionType), element: toStr(used.element), reacted: reactedBySide[side] === true, cost: effectiveCost(st, this.bundle, side, action.skillId, this.mechanisms.ruleModifiers(st, this.bundle, side)) };
      } else if (action.kind === "energy") {
        s.lastTurn = { actionType: "Energy", cost: 0 };
      } else {
        s.lastTurn = { switched: true, cost: 0 };
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

  /** 技能栏域 · 行动视图：给行动补 `slot`（1-based）与相邻技能威力（`neighborPowerSum` / `neighborPowerDiff`）。 */
  private actionView(st: BattleState, side: Side, action: Action): Action {
    if (action.kind !== "skill" || !action.skillId) return action;
    const active = this.sideState(st, side).active;
    const index = active.loadout.indexOf(action.skillId);
    const count = active.loadout.length;
    let neighborPowerSum = 0;
    let neighborPowerDiff = 0;
    if (index >= 0 && count > 1) {
      const left = index > 0 ? active.loadout[index - 1] : undefined;
      const right = index < count - 1 ? active.loadout[index + 1] : undefined;
      const leftPower = left ? toNum(getSkill(this.bundle, left).power, 0) : 0;
      const rightPower = right ? toNum(getSkill(this.bundle, right).power, 0) : 0;
      neighborPowerSum = leftPower + rightPower;
      neighborPowerDiff = Math.abs(leftPower - rightPower);
    }
    const skill = getSkill(this.bundle, action.skillId);
    const cost = effectiveCost(st, this.bundle, side, action.skillId, this.mechanisms.ruleModifiers(st, this.bundle, side));
    const neighborIds: string[] = [];
    if (index >= 0 && count > 1) {
      if (index > 0) neighborIds.push(active.loadout[index - 1]);
      if (index < count - 1) neighborIds.push(active.loadout[index + 1]);
    }
    return {
      ...action,
      slot: index >= 0 ? index + 1 : undefined,
      neighborPowerSum,
      neighborPowerDiff,
      neighborIds,
      cost,
      category: toStr(skill.category),
      element: toStr(skill.element),
      actionType: toStr(skill.actionType),
    } as Action;
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

  /** 技能声明的「应对」类型：读取数据层归一化出的通用字段 `skill.reaction`（引擎不认识来源格式）。 */
  private reactionOf(skillId: string | undefined): string | null {
    if (!skillId) return null;
    return toStr(getSkill(this.bundle, skillId).reaction) || null;
  }

  /** 应对成功：本技能有「应对 X」且敌方本回合使用了 X 类行动。 */
  private reactSuccess(skillId: string | undefined, opponentAction: Action): boolean {
    const reaction = this.reactionOf(skillId);
    return !!reaction && reaction === this.actionTypeOf(opponentAction);
  }
  private asBattleEvent(type: string, side: Side | null, event: {
    data: Record<string, unknown>; mechanismId?: string; effectType?: string; trigger?: string }): BattleEvent {
    return {
      type,
      side,
      text: event.mechanismId ? `机制 ${event.mechanismId}：${type}` : type,
      data: { ...event.data, mechanismId: event.mechanismId, effectType: event.effectType, trigger: event.trigger },
    };
  }

  /** 入场域 · 精灵上场：派发 `onEntry`（开局在场与每次换入都发），并更新「是否首次入场」。 */
  private enterField(st: BattleState, side: Side, info: { from: string | null; forced: boolean }): BattleEvent[] {
    const active = this.sideState(st, side).active;
    const first = !active.entered;
    active.entered = true;
    active.actedSinceEntry = false;
    return this.triggerState(st, "onEntry", {
      actorSide: side,
      targetSide: otherSide(side),
      event: { enteredSpriteId: active.spriteId, from: info.from, forced: info.forced, first },
    });
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

  private applyEnergy(st: BattleState, side: Side): BattleEvent[] {
    const active = this.sideState(st, side).active;
    const energy = asDict(this.bundle.rules.energy);
    const recover = Math.floor(toNum(energy.recover, 5));
    const cap = Math.floor(toNum(energy.max, 10));
    // 规则覆盖：`energy.noCap`（多人宿舍）时聚能不设上限。
    const noCap = this.mechanisms.ruleModifiers(st, this.bundle, side)["energy.noCap"] === true;
    const before = active.energy;
    active.energy = noCap ? active.energy + recover : Math.min(cap, active.energy + recover);
    const gained = active.energy - before;
    // 单次（nextAction）能耗条目：聚能也算一次行动，结算后移除。
    if (active.costMods?.some((m) => m.duration === "nextAction")) active.costMods = active.costMods.filter((m) => m.duration !== "nextAction");
    // 队伍域 · 历史计数：本方聚能次数（供「敌方每使用 1 次聚能」类）。
    this.bump(st, side, "charges");
    const events: BattleEvent[] = [{ type: "energy", side, text: `${active.spriteId} 聚能 +${gained}（${active.energy}/${cap}）`, data: { value: gained } }];
    // 能量域 · 获得能量触发器（供「每回复 1 能量」类，如腐植循环 / 草木苏醒时）。
    if (gained > 0) events.push(...this.triggerState(st, "energyGained", { actorSide: side, targetSide: otherSide(side), event: { value: gained } }));
    return events;
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
    // 能耗域 · aura：来源离场的条目随换人回收。
    this.pruneAuraCostMods(st);
    events.push({ type: "switch", side, text: `${side} 换上 ${target.spriteId}`, data: { forced } });
    // 入场域：换入的精灵「入场」（供「首次入场」类特性）。
    events.push(...this.enterField(st, side, { from: old.spriteId, forced }));
    // 行动域 · 入场继承：执行排队的「下个入场精灵」效果（inheritStat 由模拟器直接处理）。
    const pending = s.pendingEntry ?? [];
    s.pendingEntry = undefined;
    if (pending.length) {
      const commands: import("../mechanisms").EffectCommand[] = [];
      for (const effect of pending) {
        if (effect.type === "inheritStat") {
          const polarity = effect.polarity ?? "all";
          if (polarity !== "debuff") for (const [stat, value] of Object.entries(old.buffs)) target.buffs[stat] = (target.buffs[stat] ?? 0) + value;
          if (polarity !== "buff") for (const [stat, value] of Object.entries(old.debuffs)) target.debuffs[stat] = (target.debuffs[stat] ?? 0) + value;
          events.push({ type: "stat-inherited", side, text: `${target.spriteId} 继承 ${old.spriteId} 的强化`, data: { polarity } });
          continue;
        }
        commands.push({ type: effect.type, definition: effect, mechanismId: `entry:${side}`, trigger: "afterSwitch", actorSide: side, targetSide: side });
      }
      events.push(...this.mechanisms.applyStateCommands(st, commands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      events.push(...this.mechanisms.applyDamageCommands(st, this.bundle, commands).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    }
    events.push(...this.triggerState(st, "afterSwitch", { actorSide: side, targetSide: otherSide(side), action: { kind: "switch", benchId }, event: { from: old.spriteId, to: target.spriteId, forced } }));
    // 队伍域 · 历史计数：本方换人次数（供「敌方每更换 1 次」类）。
    this.bump(st, side, "switches");
    this.refreshDerivedCounters(st);
    return events;
  }

  /** 延迟域 · 结算到期效果（按 `timing` 派发，保留原施法方视角）。 */
  private runPendingEffects(st: BattleState, timing: "turnStart" | "turnEnd"): BattleEvent[] {
    const events: BattleEvent[] = [];
    for (const side of SIDES) {
      const s = this.sideState(st, side);
      const due = (s.pendingEffects ?? []).filter((p) => p.timing === timing && p.dueTurn <= st.turn);
      if (!due.length) continue;
      s.pendingEffects = (s.pendingEffects ?? []).filter((p) => !(p.timing === timing && p.dueTurn <= st.turn));
      const commands: import("../mechanisms").EffectCommand[] = [];
      for (const p of due) {
        for (const effect of p.effects) {
          commands.push({ type: effect.type, definition: effect, mechanismId: "scheduled", trigger: timing, actorSide: p.actorSide, targetSide: p.targetSide });
        }
      }
      events.push(...this.mechanisms.applyStateCommands(st, commands, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      events.push(...this.mechanisms.applyDamageCommands(st, this.bundle, commands).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
    }
    return events;
  }

  private executeSkill(
    st: BattleState,
    side: Side,
    action: Action,
    rng: Rng,
    commands: import("../mechanisms").EffectCommand[],
    reacted = false,
    wentFirst = false,
    burst = false,
  ): BattleEvent[] {
    const skill = action.skillId ? getSkill(this.bundle, action.skillId) : {};
    const caster = this.sideState(st, side).active;
    const ruleMods = this.mechanisms.ruleModifiers(st, this.bundle, side);
    const cost = action.skillId ? effectiveCost(st, this.bundle, side, action.skillId, ruleMods) : Math.floor(toNum(skill.cost, 0));
    // 规则覆盖 · `cost.payWithHp`（盛宴 / 石头大餐）：能量不足时以 5% 最大生命代替 1 点能耗。
    if (ruleMods["cost.payWithHp"] === true && cost > caster.energy) {
      const deficit = cost - caster.energy;
      caster.energy = 0;
      caster.hp = Math.max(0, caster.hp - Math.round(caster.maxHp * 0.05 * deficit));
    } else {
      caster.energy = Math.max(0, caster.energy - Math.max(0, cost));
    }
    // 队伍域 · 历史计数：本队累计消耗能量（供「累计消耗恰好为 N」类，如整点报时）。
    this.bump(st, side, "energySpent", Math.max(0, cost));
    // 单次（nextAction）能耗条目：本次行动结算后移除。
    if (caster.costMods?.some((m) => m.duration === "nextAction")) caster.costMods = caster.costMods.filter((m) => m.duration !== "nextAction");
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
        event: { action, skillId: action.skillId, damageType: category, reacted, wentFirst, burst },
      });
      events.push(...this.mechanisms.applyStateCommands(st, beforeDamage, this.bundle).map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      const damageEvents = this.mechanisms.applyDamageCommands(st, this.bundle, damageCommands, { reacted, wentFirst, burst, action });
      events.push(...damageEvents.map((event) => this.asBattleEvent(event.type, event.side ?? null, event)));
      const dealt = damageEvents.reduce((sum, event) => sum + toNum(event.data.value, 0), 0);
      const effectiveness = damageEvents.length ? toNum(damageEvents[damageEvents.length - 1].data.effectiveness, 1) : 1;
      events.push(...this.triggerState(st, "onHit", { actorSide: side, targetSide: opp, action, event: { skillId: action.skillId, damageType: category, element: toStr(skill.element), damage: dealt, effectiveness, resisted: effectiveness < 1, reacted } }));
      events.push(...this.triggerMarkMechanisms(st, opp, side));
      const afterDamage = this.mechanisms.dispatch({
        state: st,
        trigger: "afterDamage",
        actorSide: side,
        targetSide: opp,
        action,
        event: { action, skillId: action.skillId, damageType: category, damage: dealt, effectiveness, resisted: effectiveness < 1, reacted },
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
      // 伪造账单：本回合治疗改道计数到期清除。
      if (active.counters?.healRedirect) delete active.counters.healRedirect;
      for (const skillId of Object.keys(active.cooldowns ?? {})) {
        if (touched[side].has(skillId)) continue;
        active.cooldowns![skillId] -= 1;
        if (active.cooldowns![skillId] <= 0) delete active.cooldowns![skillId];
      }
      for (const sprite of [active, ...s.bench]) expireSkillOverrides(sprite, st.turn);
      if (s.switchLock > 0) s.switchLock -= 1;
      // 能耗域 · 时效：回合末递减 `turns` 条目。
      if (active.costMods?.length) {
        active.costMods = active.costMods.filter((m) => {
          if (m.duration !== "turns") return true;
          m.turnsLeft = toNum(m.turnsLeft, 0) - 1;
          return m.turnsLeft > 0;
        });
      }
    }
  }

  /** 能耗域 · aura：来源精灵不在场的条目回收（换人 / 阵亡后调用）。 */
  private pruneAuraCostMods(st: BattleState): void {
    for (const side of SIDES) {
      const active = this.sideState(st, side).active;
      if (!active.costMods?.length) continue;
      active.costMods = active.costMods.filter((m) => {
        if (m.duration !== "aura") return true;
        if (!m.sourceSide || !m.sourceSpriteId) return true;
        const sourceActive = this.sideState(st, m.sourceSide).active;
        return sourceActive.spriteId === m.sourceSpriteId && sourceActive.hp > 0;
      });
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
      const deathEvent = { spriteId: s.active.spriteId, killerSide: s.lastHit?.side, skillId: s.lastHit?.skillId };
      // 致命域 · 致命拦截：先派发 `beforeFatal`，若机制把生命拉回 >0 则免于阵亡（不死鸟 / 化茧 / 不朽）。
      events.push(...this.triggerState(st, "beforeFatal", { actorSide: side, targetSide: opp, event: deathEvent }));
      if (s.active.hp > 0) continue;
      events.push(...this.triggerState(st, "beforeDeath", { actorSide: side, targetSide: opp, event: deathEvent }));
      s.active.faintHandled = true;
      s.magic -= perFaint;
      // 队伍域 · 历史计数：本队力竭只数（供「每有 1 只力竭」类）；双方合计力竭只数（悼亡）。
      this.bump(st, side, "faints");
      this.bump(st, side, "bothFaints");
      this.bump(st, opp, "bothFaints");
      events.push({ type: "faint", side, text: `${s.active.spriteId} 阵亡，魔力 -${perFaint}`, data: {} });
      events.push(...this.triggerState(st, "afterDeath", { actorSide: side, targetSide: opp, event: deathEvent }));
      this.pruneAuraCostMods(st);
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
