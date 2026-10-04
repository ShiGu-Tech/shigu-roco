import { getSkill, getSprite } from "../data";
import { computeDamage } from "../effects/damage";
import { Rng } from "../rng";
import { recordSkillOverride } from "../state";
import type { BattleState, CostMod, DataBundle, Dict, Side } from "../types";
import { asDict, toArray, toNum, toStr } from "../types";
import { ActionQueue } from "./action-queue";
import { resolveContextPath } from "./conditions";
import type { DynamicRef, DynamicValue, EffectCommand, EffectDefinition, MechanismContext, MechanismEvent, TriggerName } from "./types";

interface DamageModifiers {
  attackerMult: number;
  defenderMult: number;
  reduction: number;
  hits: number;
  powerBonus: number;
}

function actionIdFor(target: string | undefined, actorSide: Side | undefined, actionIds: Record<Side, string>): string | undefined {
  if (target?.startsWith("action:")) return target.slice("action:".length);
  if (target === "player" || target === "enemy") return actionIds[target];
  return actorSide ? actionIds[actorSide] : undefined;
}

/** 由战斗种子 + 机制 id 派生的确定性随机源，保证同状态同种子可复现。 */
function hashSeed(state: BattleState, salt: string): number {
  let h = (2166136261 ^ (state.seed >>> 0)) >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 命令收集器接口：`MechanismRegistry`（DSL 路径）与 `ProgramCollector`（程序路径）都实现它——
 *  运行时只依赖 `collect`，两条路径可互换（G2b 接线与 A/B 同种子等价测试的基础）。 */
export interface MechanismSource {
  collect(context: MechanismContext): EffectCommand[];
}

/** 机制扩展的运行时外壳：负责收集命令和安全地修改行动队列。 */
export class MechanismRuntime {
  constructor(readonly registry: MechanismSource) {}

  dispatch(context: MechanismContext): EffectCommand[] {
    return this.registry.collect(context);
  }

  /** 确定性概率门：无 chance 恒过；chance 以「机制 + 触发 + 序号」派生，保证同状态同种子可复现。
   *  序号缺省取批内位置；编译程序按效果原序显式携带 `effectIndex`（单命令调用时与批位置等价）。 */
  private chancePass(state: BattleState, command: EffectCommand, index: number): boolean {
    const chance = command.definition.chance;
    if (chance === undefined) return true;
    if (chance <= 0) return false;
    if (chance >= 1) return true;
    const ordinal = command.effectIndex ?? index;
    return new Rng(hashSeed(state, `${command.mechanismId}:${command.trigger}:${ordinal}`)).next() < chance;
  }

  /** 免疫：目标精灵系别命中 effect 声明的 immuneElements（站点无免疫字段，故由机制数据声明）。 */
  private isImmune(bundle: DataBundle | undefined, spriteId: string, immuneElements: string[] | undefined): boolean {
    if (!bundle || !immuneElements?.length) return false;
    const elements = toArray<string>(getSprite(bundle, spriteId).elements);
    return elements.some((element) => immuneElements.includes(element));
  }

  /** 规则覆盖通道：收集 `passive` 触发器声明的 `setRuleModifier`（按传入 side 的在场精灵），供结算读「有效规则」。 */
  ruleModifiers(state: BattleState, bundle: DataBundle | undefined, side: Side | null): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = {};
    if (!bundle || !side) return out;
    const commands = this.dispatch({
      state,
      trigger: "passive",
      actorSide: side,
      targetSide: side === "player" ? "enemy" : "player",
      event: { spriteId: side === "player" ? state.player.active.spriteId : state.enemy.active.spriteId },
    });
    for (const command of commands) {
      const definition = command.definition;
      if (definition.type === "setRuleModifier") out[definition.key] = definition.value;
    }
    return out;
  }

  /** 某侧某印记的存储（sprite/team）与是否团队印记。 */
  private markStore(state: BattleState, bundle: DataBundle | undefined, side: Side, markId: string, scope?: "sprite" | "team"): { store: Record<string, number>; isTeam: boolean } {
    const markDef = bundle?.marks[markId];
    const isTeam = scope === "team" || (!scope && (markDef?.carrier === "field" || markDef?.carrier === "team"));
    const s = side === "player" ? state.player : state.enemy;
    return { store: isTeam ? s.teamMarks : s.active.marks, isTeam };
  }

  /** 某侧持有的全部印记 id（含精灵与团队两处）。 */
  private allMarkIds(state: BattleState, side: Side): string[] {
    const s = side === "player" ? state.player : state.enemy;
    return [...new Set([...Object.keys(s.active.marks), ...Object.keys(s.teamMarks)])];
  }

  /** 动态取值：字符串 = 点路径；对象 = 路径 + 系数 / 偏移 / 多项式（末尾 `*` 合计）；`count` 按图鉴属性统计数组条目。 */
  private dynamicValue(state: BattleState, command: EffectCommand, from: DynamicRef | undefined, fallback: number, bundle?: DataBundle): number {
    if (from === undefined) return fallback;
    const spec = typeof from === "string" ? { path: from } : from;
    const context = { state, trigger: command.trigger, actorSide: command.actorSide, targetSide: command.targetSide, event: command.event ?? {} };
    const resolved = resolveContextPath(context, spec.path);
    const raw = spec.count
      ? this.countMatches(bundle, resolved, spec.count)
      : spec.countKeys
        ? Object.keys(asDict(resolved)).length
        : toNum(resolved, fallback);
    let value = spec.terms ? spec.terms.reduce((sum, term) => sum + term.coef * Math.pow(raw, term.power), 0) : raw * (spec.scale ?? 1) + (spec.offset ?? 0);
    value += spec.terms ? (spec.offset ?? 0) : 0;
    return spec.round === "none" ? value : spec.round === "ceil" ? Math.ceil(value) : spec.round === "round" ? Math.round(value) : Math.floor(value);
  }

  /** 统计技能 id 数组中符合图鉴属性的条目数（供 `DynamicValue.count`）。 */
  private countMatches(bundle: DataBundle | undefined, resolved: unknown, filter: NonNullable<DynamicValue["count"]>): number {
    if (!bundle || !Array.isArray(resolved)) return 0;
    let count = 0;
    for (const id of resolved) {
      if (typeof id !== "string" || !bundle.skills[id]) continue;
      const skill = getSkill(bundle, id);
      if (filter.element && skill.element !== filter.element) continue;
      if (filter.category && skill.category !== filter.category) continue;
      if (filter.actionType && skill.actionType !== filter.actionType) continue;
      count += 1;
    }
    return count;
  }

  /** 印记有效上限：passive 覆盖 ?? 印记自身 ?? rules.marks.maxStack。 */
  private markCap(mods: Record<string, number | boolean>, bundle: DataBundle | undefined, markId: string): number {
    const markPolicy = asDict(bundle?.rules.marks);
    const value = mods["marks.maxStack"] ?? bundle?.marks[markId]?.maxStack ?? markPolicy.maxStack;
    return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
  }

  /** 防御技能判定（供 modifyCooldown scope=defense）。 */
  private isDefenseSkill(bundle: DataBundle | undefined, skillId: string): boolean {
    if (!bundle || !bundle.skills[skillId]) return false;
    const skill = getSkill(bundle, skillId);
    return skill.category === "Defense" || skill.actionType === "Defense";
  }

  applyStateCommands(state: BattleState, commands: EffectCommand[], bundle?: DataBundle, depth = 0): MechanismEvent[] {
    const events: MechanismEvent[] = [];
    for (let index = 0; index < commands.length; index++) {
      const command = commands[index];
      if (!this.chancePass(state, command, index)) continue;
      const definition = command.definition;
      const targetSide = this.resolveSide(definition, command);
      if (!targetSide && definition.type !== "changeWeather") continue;
      const active = targetSide === "player" ? state.player.active : targetSide === "enemy" ? state.enemy.active : undefined;

      switch (definition.type) {
        case "heal": {
          if (!active || !targetSide) break;
          const before = active.hp;
          const base = definition.amountFrom ? this.dynamicValue(state, command, definition.amountFrom, definition.amount, bundle) : definition.amount;
          const amount = Math.floor(definition.basis === "maxHp" ? active.maxHp * base : definition.basis === "currentHp" ? active.hp * base : base);
          // 规则覆盖 · `heal.redirectToDamage`（戏耍）：回复改为对敌方造成等量伤害。
          const healMods = this.ruleModifiers(state, bundle, targetSide);
          if (healMods["heal.redirectToDamage"] === true) {
            const otherSide: Side = targetSide === "player" ? "enemy" : "player";
            const opp = otherSide === "player" ? state.player.active : state.enemy.active;
            const dealt = Math.min(opp.hp, Math.max(0, amount));
            opp.hp = Math.max(0, opp.hp - dealt);
            events.push({ type: "damage", trigger: command.trigger, mechanismId: command.mechanismId, effectType: "heal", side: otherSide, data: { value: dealt, redirectedFromHeal: true } });
            break;
          }
          active.hp = Math.min(active.maxHp, active.hp + amount);
          events.push({ type: "healed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before, after: active.hp, value: active.hp - before } });
          break;
        }
        case "modifyMagic": {
          const side = targetSide === "player" ? state.player : state.enemy;
          const before = side.magic;
          side.magic += definition.delta;
          events.push({ type: "magic-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before, after: side.magic, delta: definition.delta } });
          break;
        }
        case "modifyEnergy": {
          if (!active || !targetSide) break;
          const before = active.energy;
          const delta = definition.deltaFrom ? this.dynamicValue(state, command, definition.deltaFrom, definition.delta, bundle) : definition.delta;
          active.energy = Math.max(0, active.energy + delta);
          events.push({ type: "energy-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before, after: active.energy, delta } });
          break;
        }
        case "modifySwitchLock": {
          const side = targetSide === "player" ? state.player : state.enemy;
          const before = side.switchLock;
          side.switchLock = Math.max(0, before + definition.delta);
          events.push({ type: "switch-lock-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before, after: side.switchLock, delta: definition.delta } });
          break;
        }
        case "scheduleEntry": {
          if (!targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          side.pendingEntry = [...(side.pendingEntry ?? []), ...definition.effects];
          events.push({ type: "entry-scheduled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { count: definition.effects.length } });
          break;
        }
        case "scheduleEffect": {
          if (!targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          const delay = Math.max(1, Math.floor(definition.delay ?? 1));
          const timing = definition.timing ?? "turnStart";
          const dueTurn = state.turn + delay;
          side.pendingEffects = [...(side.pendingEffects ?? []), { dueTurn, timing, effects: definition.effects, actorSide: command.actorSide, targetSide }];
          events.push({ type: "effect-scheduled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { count: definition.effects.length, dueTurn, timing } });
          break;
        }
        case "forceSwitch": {
          if (!targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          side.forcedSwitch = true;
          events.push({ type: "forced-switch", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: {} });
          break;
        }
        case "escape": {
          if (!targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          side.forcedSwitch = true;
          side.switchLock = 0;
          events.push({ type: "escaped", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: {} });
          break;
        }
        case "allowSwitch": {
          if (!targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          const before = side.switchLock;
          side.switchLock = 0;
          events.push({ type: "switch-allowed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before } });
          break;
        }
        case "swap": {
          const selfSide = command.actorSide === "player" ? state.player : state.enemy;
          const oppSide = command.actorSide === "player" ? state.enemy : state.player;
          if (definition.what === "hpRatio") {
            const aRatio = selfSide.active.maxHp > 0 ? selfSide.active.hp / selfSide.active.maxHp : 0;
            const bRatio = oppSide.active.maxHp > 0 ? oppSide.active.hp / oppSide.active.maxHp : 0;
            selfSide.active.hp = Math.max(0, Math.min(selfSide.active.maxHp, Math.floor(selfSide.active.maxHp * bRatio)));
            oppSide.active.hp = Math.max(0, Math.min(oppSide.active.maxHp, Math.floor(oppSide.active.maxHp * aRatio)));
          } else if (definition.what === "skills") {
            const tmp = selfSide.active.loadout;
            selfSide.active.loadout = oppSide.active.loadout;
            oppSide.active.loadout = tmp;
          } else {
            const buffs = selfSide.active.buffs;
            selfSide.active.buffs = oppSide.active.buffs;
            oppSide.active.buffs = buffs;
            const debuffs = selfSide.active.debuffs;
            selfSide.active.debuffs = oppSide.active.debuffs;
            oppSide.active.debuffs = debuffs;
          }
          events.push({ type: "swapped", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: command.actorSide, data: { what: definition.what } });
          break;
        }
        case "setHpRatio": {
          const selfSide = command.actorSide === "player" ? state.player : state.enemy;
          const oppSide = command.actorSide === "player" ? state.enemy : state.player;
          const ratio = oppSide.active.maxHp > 0 ? oppSide.active.hp / oppSide.active.maxHp : 0;
          selfSide.active.hp = Math.max(0, Math.min(selfSide.active.maxHp, Math.floor(selfSide.active.maxHp * ratio)));
          events.push({ type: "hp-ratio-set", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: command.actorSide, data: { ratio } });
          break;
        }
        case "clearStat": {
          if (!active || !targetSide) break;
          const polarity = definition.polarity ?? "all";
          const amount = definition.layers === "all" || definition.layers === undefined ? Number.POSITIVE_INFINITY : Math.max(0, definition.layers);
          const buckets: Record<string, number>[] = [];
          if (polarity !== "debuff") buckets.push(active.buffs);
          if (polarity !== "buff") buckets.push(active.debuffs);
          const cleared: Record<string, number> = {};
          let typesLeft = definition.limit ?? Number.POSITIVE_INFINITY;
          for (const bucket of buckets) {
            for (const stat of definition.stat ? [definition.stat] : Object.keys(bucket)) {
              if (typesLeft <= 0) break;
              const before = bucket[stat] ?? 0;
              // 增益为正、减益为负（`modifyStat` 口径），故按绝对值结算。
              const magnitude = Math.abs(before);
              if (magnitude <= 0) continue;
              const removed = Math.min(magnitude, amount);
              if (magnitude - removed <= 0) delete bucket[stat];
              else bucket[stat] = before - Math.sign(before) * removed;
              cleared[stat] = (cleared[stat] ?? 0) + removed;
              typesLeft -= 1;
            }
          }
          events.push({ type: "stat-cleared", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { polarity, stat: definition.stat ?? null, layers: definition.layers ?? "all", cleared } });
          break;
        }
        case "modifySkillCost": {
          if (!active || !targetSide) break;
          const scope = definition.scope ?? "skill";
          const key = definition.key ?? `${command.mechanismId}:${scope}:${definition.skillId ?? "*"}`;
          let delta = definition.delta ?? 0;
          if (definition.deltaFrom) delta += this.dynamicValue(state, command, definition.deltaFrom, 0, bundle);
          const sourceActive = command.actorSide === "player" ? state.player.active : command.actorSide === "enemy" ? state.enemy.active : undefined;
          const source: CostMod["source"] =
            command.ownerType === "trait" ? "trait" : command.ownerType === "skill" ? "skill" : command.ownerType === "status" || command.ownerType === "mark" ? "status" : "system";
          const entry: CostMod = {
            key,
            source,
            sourceId: command.ownerId,
            sourceSide: command.actorSide,
            sourceSpriteId: sourceActive?.spriteId,
            scope,
            skillId: definition.skillId,
            slots: definition.slots,
            elements: definition.elements,
            excludeElements: definition.excludeElements,
            delta,
            multiply: definition.multiply,
            mode: definition.mode,
            duration: definition.duration ?? "permanent",
            turnsLeft: definition.duration === "turns" ? Math.max(1, definition.turns ?? 1) : undefined,
            oncePerTurn: definition.oncePerTurn,
            dispellable: definition.dispellable ?? false,
            hidden: definition.hidden ?? (source !== "trait" && source !== "status"),
          };
          active.costMods ??= [];
          const existingIndex = active.costMods.findIndex((m) => m.key === key);
          if (existingIndex >= 0 && definition.mode !== "set") {
            const existing = active.costMods[existingIndex];
            existing.delta = toNum(existing.delta, 0) + delta;
            existing.multiply = (existing.multiply ?? 1) * (definition.multiply ?? 1);
            existing.turnsLeft = entry.turnsLeft ?? existing.turnsLeft;
          } else if (existingIndex >= 0) {
            active.costMods[existingIndex] = entry;
          } else {
            active.costMods.push(entry);
          }
          events.push({ type: "skill-cost-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { scope, skillId: definition.skillId ?? null, delta, multiply: definition.multiply ?? 1, duration: entry.duration, source, sourceId: entry.sourceId ?? null, dispellable: entry.dispellable, hidden: entry.hidden, key } });
          break;
        }
        case "clearCostMod": {
          if (!active || !targetSide) break;
          const before = active.costMods ?? [];
          const kept = before.filter((m) => !(definition.all ? true : (m.dispellable && toNum(m.delta, 0) >= 0 && (m.multiply ?? 1) >= 1)));
          active.costMods = kept;
          events.push({ type: "skill-cost-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { cleared: before.length - kept.length } });
          break;
        }
        case "addCounter": {
          if (!active || !targetSide) break;
          active.counters ??= {};
          const before = active.counters[definition.key] ?? 0;
          active.counters[definition.key] = before + definition.delta;
          events.push({ type: "counter-added", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { key: definition.key, before, after: active.counters[definition.key] } });
          break;
        }
        case "setCounter": {
          if (!active || !targetSide) break;
          active.counters ??= {};
          const before = active.counters[definition.key] ?? 0;
          const value = Math.floor(this.dynamicValue(state, command, definition.valueFrom, definition.value ?? 0, bundle));
          active.counters[definition.key] = value;
          events.push({ type: "counter-set", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { key: definition.key, before, after: value } });
          break;
        }
        case "clearCounter": {
          if (!active || !targetSide) break;
          if (!active.counters) break;
          if (definition.key) delete active.counters[definition.key];
          else active.counters = {};
          events.push({ type: "counter-cleared", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { key: definition.key ?? null } });
          break;
        }
        case "modifySkill": {
          if (!active || !targetSide) break;
          active.skillMods ??= {};
          const mod = (active.skillMods[definition.skillId] ??= {});
          for (const field of ["power", "cost", "hits", "priority"] as const) {
            const delta = definition[field];
            if (typeof delta === "number") mod[field] = (mod[field] ?? 0) + delta;
          }
          events.push({ type: "skill-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId: definition.skillId, mod: { ...mod } } });
          break;
        }
        case "applyMark": {
          if (!active || !targetSide) break;
          if (this.isImmune(bundle, active.spriteId, definition.immuneElements)) {
            events.push({ type: "mark-immune", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId } });
            break;
          }
          const { store, isTeam } = this.markStore(state, bundle, targetSide, definition.markId, definition.scope);
          // 有效规则 = passive 覆盖 ?? rules 默认。异种印记互斥 / 上限都可由特性（如吟游之弦）经 setRuleModifier 突破。
          const markPolicy = asDict(bundle?.rules.marks);
          const mods = this.ruleModifiers(state, bundle, command.actorSide ?? null);
          // 层数 = 基础值 + layersFrom 动态值（layersFrom 存在时基础默认 0，纯动态）。
          const base = definition.layers ?? (definition.layersFrom ? 0 : 1);
          const dynamic = definition.layersFrom ? this.dynamicValue(state, command, definition.layersFrom, 0, bundle) : 0;
          const delta = Math.floor(base + dynamic);
          if (delta <= 0) break;
          if ((mods["marks.replaceDifferent"] ?? markPolicy.replaceDifferent) !== false) {
            for (const other of Object.keys(store)) if (other !== definition.markId) delete store[other];
          }
          const before = store[definition.markId] ?? 0;
          store[definition.markId] = Math.min(this.markCap(mods, bundle, definition.markId), before + delta);
          events.push({ type: "mark-applied", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId, scope: isTeam ? "team" : "sprite", before, after: store[definition.markId] } });
          break;
        }
        case "setMark": {
          if (!active || !targetSide) break;
          const { store, isTeam } = this.markStore(state, bundle, targetSide, definition.markId, definition.scope);
          const mods = this.ruleModifiers(state, bundle, command.actorSide ?? null);
          const before = store[definition.markId] ?? 0;
          const wanted = Math.max(0, Math.floor(this.dynamicValue(state, command, definition.layersFrom, definition.layers ?? 0, bundle)));
          const after = Math.min(this.markCap(mods, bundle, definition.markId), wanted);
          if (after <= 0) delete store[definition.markId];
          else store[definition.markId] = after;
          events.push({ type: "mark-set", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId, scope: isTeam ? "team" : "sprite", before, after } });
          break;
        }
        case "scaleMark": {
          if (!active || !targetSide) break;
          const mods = this.ruleModifiers(state, bundle, command.actorSide ?? null);
          const ids = definition.markId ? [definition.markId] : this.allMarkIds(state, targetSide);
          for (const markId of ids) {
            const { store } = this.markStore(state, bundle, targetSide, markId, definition.scope);
            const before = store[markId] ?? 0;
            if (before <= 0) continue;
            const after = Math.max(0, Math.min(this.markCap(mods, bundle, markId), Math.floor(before * (definition.factor ?? 1) + (definition.delta ?? 0))));
            if (after <= 0) delete store[markId];
            else store[markId] = after;
            events.push({ type: "mark-scaled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId, before, after } });
          }
          break;
        }
        case "transferMark": {
          const actor = command.actorSide;
          const target = command.targetSide;
          const fromSide = definition.from === "self" ? actor : definition.from === "opponent" ? target : target;
          const toSide = definition.to === "self" ? actor : definition.to === "opponent" ? target : actor;
          if (!fromSide || !toSide) break;
          const ids = definition.markId ? [definition.markId] : this.allMarkIds(state, fromSide);
          let remaining = definition.amount === undefined || definition.amount === "all" ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(definition.amount));
          for (const markId of ids) {
            if (remaining <= 0) break;
            const { store: fromStore } = this.markStore(state, bundle, fromSide, markId);
            const before = fromStore[markId] ?? 0;
            if (before <= 0) continue;
            const moved = Math.min(before, remaining);
            const { store: toStore } = this.markStore(state, bundle, toSide, markId);
            toStore[markId] = (toStore[markId] ?? 0) + moved;
            if (before - moved <= 0) delete fromStore[markId];
            else fromStore[markId] = before - moved;
            remaining -= moved;
            events.push({ type: "mark-transferred", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, data: { markId, from: fromSide, to: toSide, moved } });
          }
          break;
        }
        case "transformMark": {
          if (!active || !targetSide) break;
          const ids = this.allMarkIds(state, targetSide);
          let total = 0;
          for (const markId of ids) total += this.markStore(state, bundle, targetSide, markId).store[markId] ?? 0;
          for (const markId of ids) delete this.markStore(state, bundle, targetSide, markId).store[markId];
          if (total > 0) {
            const { store } = this.markStore(state, bundle, targetSide, definition.toMarkId, definition.scope);
            store[definition.toMarkId] = total;
          }
          events.push({ type: "mark-transformed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.toMarkId, before: total } });
          break;
        }
        case "consumeMark": {
          if (!active || !targetSide) break;
          const ids = definition.markId ? [definition.markId] : this.allMarkIds(state, targetSide);
          let total = 0;
          for (const markId of ids) {
            const { store } = this.markStore(state, bundle, targetSide, markId, definition.scope);
            const layers = store[markId] ?? 0;
            if (layers <= 0) continue;
            total += layers;
            delete store[markId];
          }
          // 嵌套效果沿用「施法者视角」：self = 施法方，target/opponent = 施法方的对手；event 暴露 `consumed`。
          const opposite: Side | undefined = command.actorSide === "player" ? "enemy" : command.actorSide === "enemy" ? "player" : command.targetSide;
          const nestedEvent = { ...(command.event ?? {}), consumed: total, markId: definition.markId ?? null };
          const nested = (effect: EffectDefinition): EffectCommand => ({ type: effect.type, definition: effect, mechanismId: command.mechanismId, trigger: command.trigger, actorSide: command.actorSide, targetSide: opposite, event: nestedEvent });
          const perLayer: EffectCommand[] = [];
          for (let i = 0; i < total; i++) for (const effect of definition.effectsPerLayer ?? []) perLayer.push(nested(effect as EffectDefinition));
          for (const effect of definition.effectsOnConsume ?? []) perLayer.push(nested(effect as EffectDefinition));
          events.push({ type: "mark-consumed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId ?? null, total } });
          if (perLayer.length) {
            events.push(...this.applyStateCommands(state, perLayer, bundle, depth + 1));
            if (bundle) events.push(...this.applyDamageCommands(state, bundle, perLayer));
          }
          break;
        }
        case "removeMark": {
          if (!active || !targetSide) break;
          // markId 省略 = 驱散该侧全部印记（精灵 + 团队）。
          const ids = definition.markId ? [definition.markId] : this.allMarkIds(state, targetSide);
          for (const markId of ids) {
            const { store, isTeam } = this.markStore(state, bundle, targetSide, markId, definition.scope);
            const before = store[markId] ?? 0;
            if (before <= 0) continue;
            const after = Math.max(0, before - (definition.layers ?? before));
            if (after === 0) delete store[markId];
            else store[markId] = after;
            events.push({ type: "mark-removed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId, scope: isTeam ? "team" : "sprite", before, after } });
          }
          break;
        }
        case "settleMark": {
          if (!active || !targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          const store = definition.markId in active.marks ? active.marks : side.teamMarks;
          const before = store[definition.markId] ?? 0;
          if (before <= 0) break;
          let after = before;
          if (typeof definition.delta === "number") after = Math.max(0, before - definition.delta);
          else if (definition.decayLayers === "half") after = Math.floor(before / 2);
          else if (definition.decayLayers === "clear") after = 0;
          if (after === 0) delete store[definition.markId];
          else store[definition.markId] = after;
          events.push({ type: "mark-settled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId, before, after } });
          break;
        }
        case "changeWeather":
          state.weather = { id: definition.weatherId, turnsLeft: definition.turns ?? 1 };
          events.push({ type: "weather-changed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, data: { weatherId: definition.weatherId, turns: state.weather.turnsLeft } });
          break;
        case "randomStatDebuff": {
          if (!active || !targetSide) break;
          const stats = definition.stats ?? ["atk", "spatk", "defense", "spdef", "speed"];
          const rng = new Rng(hashSeed(state, `${command.mechanismId}:${state.turn}`));
          const cap = toNum(asDict(bundle?.rules.stage).cap, Number.POSITIVE_INFINITY);
          const applied: Record<string, number> = {};
          for (let i = 0; i < definition.layers; i++) {
            const stat = stats[rng.int(stats.length)];
            active.debuffs[stat] = Math.max(-cap, Math.min(cap, (active.debuffs[stat] ?? 0) - 1));
            applied[stat] = (applied[stat] ?? 0) + 1;
          }
          events.push({ type: "stat-debuffed-random", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { layers: definition.layers, applied } });
          break;
        }
        case "grantDedication": {
          const side = targetSide === "player" ? state.player : targetSide === "enemy" ? state.enemy : undefined;
          if (!side) break;
          const defaults: { key: "power" | "combo" | "cost" | "lifesteal"; value: number }[] = [
            { key: "power", value: 20 },
            { key: "combo", value: 1 },
            { key: "cost", value: 2 },
            { key: "lifesteal", value: 0.1 },
          ];
          const count = Math.max(1, Math.floor(definition.count ?? 1));
          const rng = new Rng(hashSeed(state, `${command.mechanismId}:${state.turn}:dedication`));
          side.dedications ??= [];
          for (let i = 0; i < count; i++) {
            const pick = definition.key ? { key: definition.key, value: definition.value ?? defaults.find((d) => d.key === definition.key)?.value ?? 0 } : defaults[rng.int(defaults.length)];
            side.dedications.push({ key: pick.key, value: pick.value });
          }
          events.push({ type: "dedication-granted", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { count, queue: side.dedications.length } });
          break;
        }
        case "consumeDedication": {
          const side = targetSide === "player" ? state.player : targetSide === "enemy" ? state.enemy : undefined;
          if (!side?.dedications?.length) break;
          const consumed = side.dedications.shift()!;
          const act = side.active;
          act.counters ??= {};
          if (consumed.key === "power") act.counters["ded-power"] = toNum(act.counters["ded-power"], 0) + consumed.value;
          else if (consumed.key === "combo") act.counters["ded-combo"] = toNum(act.counters["ded-combo"], 0) + consumed.value;
          else if (consumed.key === "lifesteal") act.counters["ded-lifesteal"] = toNum(act.counters["ded-lifesteal"], 0) + consumed.value;
          else if (consumed.key === "cost") {
            act.costMods ??= [];
            act.costMods.push({ scope: "skill", skillId: definition.skillId, delta: -consumed.value, duration: "nextAction", key: `dedication:${command.mechanismId}` } as CostMod);
          }
          events.push({ type: "dedication-consumed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { key: consumed.key, value: consumed.value, skillId: definition.skillId } });
          break;
        }
        case "beginCharge": {
          if (!active || !targetSide) break;
          const skillId = definition.skillId;
          if (!skillId) break;
          active.pendingSkill = definition.choice === undefined ? { skillId } : { skillId, choice: definition.choice };
          const side = targetSide === "player" ? state.player : state.enemy;
          side.switchLock = (side.switchLock ?? 0) + 1;
          events.push({ type: "skill-charged", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId } });
          break;
        }
        case "modifyWeatherTurns": {
          if (!state.weather) break;
          if (definition.weatherId && state.weather.id !== definition.weatherId) break;
          state.weather.turnsLeft = Math.max(0, state.weather.turnsLeft + definition.delta);
          events.push({ type: "weather-turns-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, data: { weatherId: state.weather.id, turns: state.weather.turnsLeft, delta: definition.delta } });
          break;
        }
        case "applyStatus": {
          if (!active || !targetSide) break;
          if (this.isImmune(bundle, active.spriteId, definition.immuneElements)) {
            events.push({ type: "status-immune", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId } });
            break;
          }
          const before = active.statuses[definition.statusId] ?? 0;
          const delta = definition.layersFrom !== undefined ? Math.max(0, Math.floor(this.dynamicValue(state, command, definition.layersFrom, definition.layers ?? 1, bundle))) : (definition.layers ?? 1);
          if (delta <= 0) break;
          active.statuses[definition.statusId] = before + delta;
          const sourceActive = command.actorSide === "player" ? state.player.active : command.actorSide === "enemy" ? state.enemy.active : undefined;
          events.push({ type: "status-applied", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId, before, after: active.statuses[definition.statusId], layers: delta, sourceSide: command.actorSide ?? null, sourceSpriteId: sourceActive?.spriteId ?? null } });
          break;
        }
        case "setStatus": {
          if (!active || !targetSide) break;
          const before = active.statuses[definition.statusId] ?? 0;
          const wanted = Math.max(0, Math.floor(this.dynamicValue(state, command, definition.layersFrom, definition.layers ?? 0, bundle)));
          if (wanted <= 0) delete active.statuses[definition.statusId];
          else active.statuses[definition.statusId] = wanted;
          events.push({ type: "status-set", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId, before, after: wanted } });
          break;
        }
        case "scaleStatus": {
          if (!active || !targetSide) break;
          for (const statusId of definition.statusId ? [definition.statusId] : Object.keys(active.statuses)) {
            const before = active.statuses[statusId] ?? 0;
            if (before <= 0) continue;
            const after = Math.max(0, Math.floor(before * (definition.factor ?? 1) + (definition.delta ?? 0)));
            if (after <= 0) delete active.statuses[statusId];
            else active.statuses[statusId] = after;
            events.push({ type: "status-scaled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId, before, after } });
          }
          break;
        }
        case "settleStatus": {
          if (!active || !targetSide) break;
          const before = active.statuses[definition.statusId] ?? 0;
          if (before <= 0) break;
          let after = before;
          // 规则覆盖按**双方**合并（「在场时所有灼烧」类不受受影响侧限制）。
          const statusMods = { ...this.ruleModifiers(state, bundle, "player"), ...this.ruleModifiers(state, bundle, "enemy") };
          const decayed = definition.decayLayers === "half" ? Math.floor(before / 2) : typeof definition.delta === "number" ? Math.min(before, definition.delta) : definition.decayLayers === "clear" ? before : 0;
          // 规则覆盖 · 灼烧衰减改写（煤渣草 `status.burnGrow` / 焰色反应 `status.burnToPoison`）。
          if (definition.statusId === "burn" && statusMods["status.burnGrow"] === true) {
            after = before + Math.ceil(before / 2);
          } else if (definition.statusId === "burn" && statusMods["status.burnToPoison"] === true) {
            after = Math.max(0, before - decayed);
            if (decayed > 0) active.statuses.poison = (active.statuses.poison ?? 0) + decayed;
          } else if (typeof definition.delta === "number") after = Math.max(0, before - definition.delta);
          else if (definition.decayLayers === "half") after = Math.floor(before / 2);
          else if (definition.decayLayers === "clear") after = 0;
          if (after === 0) delete active.statuses[definition.statusId];
          else active.statuses[definition.statusId] = after;
          events.push({ type: "status-settled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId, before, after } });
          break;
        }
        case "removeStatus": {
          if (!active || !targetSide) break;
          const existed = definition.statusId in active.statuses;
          delete active.statuses[definition.statusId];
          if (existed) events.push({ type: "status-removed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId } });
          break;
        }
        case "modifyCooldown": {
          if (!active || !targetSide) break;
          const skillIds = definition.skillId
            ? [definition.skillId]
            : definition.scope === "defense"
              ? active.loadout.filter((id) => this.isDefenseSkill(bundle, id))
              : [];
          if (!skillIds.length) break;
          active.cooldowns ??= {};
          for (const skillId of skillIds) {
            const before = active.cooldowns[skillId] ?? 0;
            active.cooldowns[skillId] = Math.max(definition.minimum ?? 0, before + definition.delta);
            events.push({ type: "cooldown-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId, before, after: active.cooldowns[skillId], delta: definition.delta } });
          }
          break;
        }
        case "modifyStat": {
          if (!active || !targetSide) break;
          const raw = definition.valueFrom ? this.dynamicValue(state, command, definition.valueFrom, definition.value, bundle) : definition.value;
          const value = definition.mode === "percent" && Math.abs(raw) > 1 ? raw / 100 : raw;
          const bucket = value >= 0 ? active.buffs : active.debuffs;
          const cap = definition.maxStages ?? toNum(asDict(bundle?.rules.stage).cap, Number.POSITIVE_INFINITY);
          const before = bucket[definition.stat] ?? 0;
          bucket[definition.stat] = Math.max(-cap, Math.min(cap, before + value));
          events.push({ type: "stat-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { stat: definition.stat, before, after: bucket[definition.stat], mode: definition.mode } });
          // 增益 / 减益获得：作为领域事件再次派发（供「获得增益/减益时」类特性）。
          if (value !== 0) {
            events.push({
              type: value > 0 ? "buff-gained" : "debuff-gained",
              trigger: command.trigger,
              mechanismId: command.mechanismId,
              effectType: definition.type,
              side: targetSide,
              data: { stat: definition.stat, value, before, after: bucket[definition.stat], mode: definition.mode, sourceSide: command.actorSide ?? null },
            });
          }
          break;
        }
        case "scaleStat": {
          if (!active || !targetSide) break;
          const factor = definition.factor ?? 1;
          const delta = definition.delta ?? 0;
          const polarity = definition.polarity ?? "all";
          const buckets: [string, Record<string, number>][] = [];
          if (polarity !== "debuff") buckets.push(["buff", active.buffs]);
          if (polarity !== "buff") buckets.push(["debuff", active.debuffs]);
          for (const [, bucket] of buckets) {
            const keys = definition.stat ? [definition.stat] : Object.keys(bucket);
            for (const stat of keys) {
              const before = bucket[stat] ?? 0;
              if (before === 0) continue;
              const after = Math.max(-999, Math.min(999, before * factor + delta));
              bucket[stat] = after;
              events.push({ type: "stat-scaled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { stat, before, after } });
            }
          }
          break;
        }
        case "convertBuffToStatus": {
          if (!active || !targetSide) break;
          const factor = definition.factor ?? 1;
          let total = 0;
          for (const stat of Object.keys(active.buffs)) {
            const value = active.buffs[stat] ?? 0;
            if (value > 0) total += value;
            delete active.buffs[stat];
          }
          const layers = Math.max(0, Math.floor(total * factor));
          if (layers <= 0) break;
          const before = active.statuses[definition.statusId] ?? 0;
          active.statuses[definition.statusId] = before + layers;
          events.push({ type: "status-applied", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId, before, after: active.statuses[definition.statusId], layers, sourceSide: command.actorSide ?? null } });
          break;
        }
        case "learnSkill": {
          if (!active || !targetSide) break;
          const { skillId } = definition;
          if (!skillId || active.loadout.includes(skillId)) break;
          active.loadout = [...active.loadout, skillId];
          if (definition.duration) recordSkillOverride(active, skillId, "", definition.duration < 0 ? -1 : state.turn + definition.duration);
          events.push({ type: "skill-learned", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId, loadout: active.loadout } });
          break;
        }
        case "forgetSkill": {
          if (!active || !targetSide) break;
          const before = active.loadout.length;
          active.loadout = active.loadout.filter((id) => id !== definition.skillId);
          if (active.loadout.length !== before) events.push({ type: "skill-forgotten", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId: definition.skillId, loadout: active.loadout } });
          break;
        }
        case "replaceSkill": {
          if (!active || !targetSide) break;
          const { fromSkillId, toSkillId } = definition;
          if (!active.loadout.includes(fromSkillId)) break;
          active.loadout = active.loadout.map((id) => (id === fromSkillId ? toSkillId : id));
          if (definition.duration) recordSkillOverride(active, toSkillId, fromSkillId, definition.duration < 0 ? -1 : state.turn + definition.duration);
          events.push({ type: "skill-replaced", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { fromSkillId, toSkillId, loadout: active.loadout } });
          break;
        }
        case "randomizeSkill": {
          if (!active || !targetSide) break;
          const current = definition.skillId ?? active.loadout[active.loadout.length - 1];
          const source = definition.sourceFrom
            ? toArray<string>(resolveContextPath({ state, trigger: command.trigger, actorSide: command.actorSide, targetSide: command.targetSide, event: command.event ?? {} }, definition.sourceFrom))
            : (definition.source ?? []);
          const pool = source.filter((id) => id && id !== current);
          if (!current || !pool.length) break;
          const rng = new Rng(hashSeed(state, `${command.mechanismId}:${state.turn}`));
          const picked = pool[rng.int(pool.length)];
          active.loadout = active.loadout.includes(current)
            ? active.loadout.map((id) => (id === current ? picked : id))
            : [...active.loadout, picked];
          recordSkillOverride(active, picked, current, definition.duration ? state.turn + definition.duration : 0, definition.costDelta);
          events.push({ type: "skill-randomized", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { from: current, to: picked, loadout: active.loadout } });
          break;
        }
        case "swapSkillSet": {
          if (!active || !targetSide) break;
          const { from, to } = definition;
          const fromIndex = active.loadout.indexOf(from);
          if (fromIndex < 0) break;
          const toIndex = active.loadout.indexOf(to);
          if (toIndex >= 0) {
            active.loadout = [...active.loadout];
            active.loadout[fromIndex] = to;
            active.loadout[toIndex] = from;
          } else {
            active.loadout = active.loadout.map((id) => (id === from ? to : id));
            if (definition.duration) recordSkillOverride(active, to, from, definition.duration < 0 ? -1 : state.turn + definition.duration);
          }
          events.push({ type: "skill-set-swapped", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { from, to, loadout: active.loadout } });
          break;
        }
        case "rotateLoadout": {
          if (!active || !targetSide) break;
          const skillId = definition.skillId ?? command.ownerId;
          if (!skillId) break;
          const index = active.loadout.indexOf(skillId);
          if (index < 0) break;
          const slots = Math.floor(definition.slots);
          const next = ((index + slots) % active.loadout.length + active.loadout.length) % active.loadout.length;
          if (next === index) break;
          active.loadout = [...active.loadout];
          active.loadout.splice(index, 1);
          active.loadout.splice(next, 0, skillId);
          events.push({ type: "loadout-rotated", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId, from: index, to: next, loadout: active.loadout } });
          break;
        }
        default:
          break;
      }
    }

    if (depth < 4) {
      for (const event of [...events]) {
        // 领域事件 → 级联触发器（状态 / 印记同时派发「已施加」与「跨阈值」两类，阈值由数据 `when` 判定）。
        const triggers: TriggerName[] =
          event.type === "status-applied" ? ["statusApplied", "statusReached"]
          : event.type === "mark-applied" ? ["markApplied", "markReached"]
          : event.type === "buff-gained" ? ["buffGained"]
          : event.type === "debuff-gained" ? ["debuffGained"]
          : event.type === "energy-modified" && toNum(event.data.delta, 0) > 0 ? ["energyGained"]
          : event.type === "skill-charged" ? ["charged"]
          : event.type === "healed" ? ["heal"]
          : event.type === "damage" && event.data.ownerType === "status" ? ["statusDamage"]
          : [];
        if (!triggers.length) continue;
        const actorSide = event.side;
        const targetSide = actorSide === "player" ? "enemy" : actorSide === "enemy" ? "player" : undefined;
        const cascaded: EffectCommand[] = [];
        for (const trigger of triggers) {
          cascaded.push(...this.dispatch({ state, trigger, actorSide, targetSide, event: event.data }));
        }
        if (!cascaded.length) continue;
        events.push(...this.applyStateCommands(state, cascaded, bundle, depth + 1));
        if (bundle) events.push(...this.applyDamageCommands(state, bundle, cascaded));
      }
    }
    return events;
  }

  applyDamageCommands(state: BattleState, bundle: DataBundle, commands: EffectCommand[], extraEvent?: Dict): MechanismEvent[] {
    const events: MechanismEvent[] = [];
    for (let index = 0; index < commands.length; index++) {
      const command = commands[index];
      if (!this.chancePass(state, command, index)) continue;
      const definition = command.definition;
      if (definition.type !== "dealDamage") continue;
      const targetSide = this.resolveSide(definition, command) ?? command.targetSide;
      const attackerSide = command.actorSide;
      if (!targetSide || !attackerSide) continue;
      const attacker = attackerSide === "player" ? state.player.active : state.enemy.active;
      const target = targetSide === "player" ? state.player.active : state.enemy.active;
      if (target.hp <= 0) continue;
      const attackerDef = getSprite(bundle, attacker.spriteId);
      const targetDef = getSprite(bundle, target.spriteId);
      const skill = definition.skillId ? getSkill(bundle, definition.skillId) : { category: definition.category, power: definition.power, element: definition.element };
      // 记忆域 · 技能永久修正：本技能的威力 delta 叠加到基础威力上。
      const powerDelta = toNum(attacker.skillMods?.[definition.skillId ?? ""]?.power, 0);
      let effectiveSkill = powerDelta ? { ...skill, power: toNum(skill.power, 0) + powerDelta } : skill;
      // 动态威力：`powerFrom` 按当前状态求值（如「能耗每 +1 威力 +50」= offset 450 + scale 50×能耗）。
      // 路径缺失按 0 计，基线由 offset 提供，避免把 fallback 也乘上 scale。
      if (definition.powerFrom) effectiveSkill = { ...effectiveSkill, power: this.dynamicValue(state, command, definition.powerFrom, 0, bundle) };
      let damage: number;
      let effectiveness = 1;
      let modifiers: DamageModifiers | null = null;
      let breakdown: Record<string, number> | null = null;
      if (definition.basis && definition.basis !== "formula") {
        const amount = definition.amount ?? definition.power;
        damage = definition.basis === "maxHp" ? Math.floor(target.maxHp * amount) : definition.basis === "currentHp" ? Math.floor(target.hp * amount) : definition.basis === "stack" ? Math.floor(target.maxHp * amount * (target.marks[definition.markId ?? ""] ?? 0)) : Math.floor(amount);
      } else {
        modifiers = this.damageModifiers(state, attackerSide, targetSide, definition, toStr(skill.element), extraEvent, bundle);
        if (modifiers.powerBonus) effectiveSkill = { ...effectiveSkill, power: toNum(effectiveSkill.power, 0) + modifiers.powerBonus };
        const result = computeDamage(bundle, attackerDef, targetDef, attacker, target, effectiveSkill, {
          weatherId: state.weather?.id ?? null,
          attackerTraitMult: modifiers.attackerMult,
          defenderTraitMult: modifiers.defenderMult,
          damageReduction: modifiers.reduction,
          hits: modifiers.hits,
        });
        damage = result.damage;
        effectiveness = result.typeMult;
        // 内省：把已算好的伤害明细（威力 / 属性 / STAB / 克制 / 天气 / 增减伤 / 连击）透出，供 UI 与回归。
        breakdown = result.breakdown;
      }
      target.hp = Math.max(0, target.hp - damage);
      const targetState = targetSide === "player" ? state.player : state.enemy;
      targetState.lastHit = { side: attackerSide, skillId: definition.skillId };
      // 队伍域 · 已失去生命（按 25% 分段，供「每失去 25% 生命」类，如嫁祸）。
      targetState.counters ??= {};
      targetState.counters.hpLostQuarters = Math.floor(((target.maxHp - target.hp) / Math.max(1, target.maxHp)) * 4);
      events.push({ type: "damage", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { value: damage, attackerSide, skillId: definition.skillId, damageType: definition.category, effectiveness, modifiers, breakdown, ownerType: command.ownerType ?? null, ownerId: command.ownerId ?? null } });
      // 吸血：攻击方 counters["lifesteal"]（比例）按本次伤害回复自身生命。
      const attackerState = attackerSide === "player" ? state.player : state.enemy;
      const lifesteal = toNum(attackerState.active.counters?.lifesteal, 0) + toNum(attackerState.active.counters?.["ded-lifesteal"], 0);
      if (attackerState.active.counters?.["ded-lifesteal"]) attackerState.active.counters["ded-lifesteal"] = 0;
      if (lifesteal > 0 && damage > 0) {
        const before = attackerState.active.hp;
        attackerState.active.hp = Math.min(attackerState.active.maxHp, attackerState.active.hp + Math.floor(damage * lifesteal));
        events.push({ type: "lifesteal", trigger: command.trigger, mechanismId: command.mechanismId, effectType: "lifesteal", side: attackerSide, data: { value: attackerState.active.hp - before, damage } });
      }
      // 状态域 · 状态 DoT 伤害 → 派发 `statusDamage`（供「敌方受中毒/灼烧伤害时」类，如耐活王 / 月相 / 仁心）。
      if (command.ownerType === "status" && damage > 0) {
        const other: Side = targetSide === "player" ? "enemy" : "player";
        const statusCommands = this.dispatch({ state, trigger: "statusDamage", actorSide: targetSide, targetSide: other, event: { value: damage, ownerId: command.ownerId ?? null, sourceSide: attackerSide } });
        events.push(...this.applyStateCommands(state, statusCommands, bundle));
      }
    }
    return events;
  }

  /** 结算一次 dealDamage 前，按 `beforeDamage` 收集攻/防伤害修饰（攻方倍率 / 防方倍率 / 减伤 / 连击）。 */
  private damageModifiers(state: BattleState, attackerSide: Side, targetSide: Side, definition: EffectDefinition, element?: string, extraEvent?: Dict, bundle?: DataBundle): DamageModifiers {
    const commands = this.dispatch({
      state,
      trigger: "beforeDamage",
      actorSide: attackerSide,
      targetSide,
      event: {
        skillId: definition.type === "dealDamage" ? definition.skillId : undefined,
        category: definition.type === "dealDamage" ? definition.category : undefined,
        power: definition.type === "dealDamage" ? definition.power : undefined,
        element,
        ...(extraEvent ?? {}),
      },
    });
    const attacker = attackerSide === "player" ? state.player.active : state.enemy.active;
    const skillId = definition.type === "dealDamage" ? definition.skillId : undefined;
    let attackerMult = 1;
    let defenderMult = 1;
    let reduction = 0;
    let powerBonus = 0;
    // 记忆域 · 技能永久修正：本技能的基础连击段数。
    let hits = 1 + toNum(skillId ? attacker.skillMods?.[skillId]?.hits : 0, 0);
    for (const command of commands) {
      const d = command.definition;
      if (d.type === "addPower") {
        powerBonus += d.valueFrom ? this.dynamicValue(state, command, d.valueFrom, 0, bundle) : d.value;
      } else if (d.type === "modifyDamage") {
        const outgoing = d.scope ? d.scope === "outgoing" : command.actorSide === attackerSide;
        const factor = d.mode === "add" ? 1 + d.value : d.value;
        if (outgoing) attackerMult *= factor;
        else defenderMult *= factor;
      } else if (d.type === "setHits") {
        if (d.hitsFrom) {
          const context = { state, trigger: "beforeDamage" as const, actorSide: attackerSide, targetSide, event: { skillId } };
          const spec = typeof d.hitsFrom === "string" ? { path: d.hitsFrom } : d.hitsFrom;
          hits = Math.max(1, Math.floor(toNum(resolveContextPath(context, spec.path), 1) * (spec.scale ?? 1) + (spec.offset ?? 0)));
        } else if (d.markId) {
          const holder = targetSide === "player" ? state.player.active : state.enemy.active;
          const stacks = toNum(holder.marks?.[d.markId], 0);
          hits = Math.max(1, Math.floor((d.base ?? 1) + (d.perStack ?? 1) * stacks));
        } else {
          hits = Math.max(1, Math.floor(d.hits ?? 1));
        }
      } else if (d.type === "setDamageReduction") {
        if (d.percentFrom) {
          const context = { state, trigger: "beforeDamage" as const, actorSide: attackerSide, targetSide, event: { skillId } };
          reduction += toNum(resolveContextPath(context, d.percentFrom.path), 0) * (d.percentFrom.scale ?? 1) + (d.percentFrom.offset ?? 0);
        } else {
          reduction += d.percent;
        }
      }
    }
    // 奉献域 · 一次性威力 / 连击（消耗后清零）。
    const dedPower = toNum(attacker.counters?.["ded-power"], 0);
    if (dedPower) {
      powerBonus += dedPower;
      attacker.counters!["ded-power"] = 0;
    }
    const dedCombo = toNum(attacker.counters?.["ded-combo"], 0);
    if (dedCombo) {
      hits += dedCombo;
      attacker.counters!["ded-combo"] = 0;
    }
    // 「下一次攻击」一次性加成（消耗后清零）：next-damage-mul（+N% 伤害）/ next-power-add（+N 威力）。
    const nextMul = toNum(attacker.counters?.["next-damage-mul"], 0);
    if (nextMul) {
      attackerMult *= 1 + nextMul;
      attacker.counters!["next-damage-mul"] = 0;
    }
    const nextAdd = toNum(attacker.counters?.["next-power-add"], 0);
    if (nextAdd) {
      powerBonus += nextAdd;
      attacker.counters!["next-power-add"] = 0;
    }
    // 记忆域 · 连击数 buff：`combo-add`（+N 段）/ `combo-mul`（+N% 段，1 = +100%）叠加在技能自身段数之上。
    const comboAdd = toNum(attacker.counters?.["combo-add"], 0);
    const comboMul = toNum(attacker.counters?.["combo-mul"], 0);
    if (comboAdd || comboMul) hits = Math.max(1, Math.floor((hits + comboAdd) * (1 + comboMul)));
    // 规则覆盖 · `simple.powerMul`（不移）：无额外效果的攻击技能威力提升。
    if (skillId && bundle) {
      const mods = this.ruleModifiers(state, bundle, attackerSide);
      if (typeof mods["simple.powerMul"] === "number") {
        const tags = toArray<string>(getSkill(bundle, skillId).tags);
        if (tags.includes("simple")) attackerMult *= 1 + (mods["simple.powerMul"] as number);
      }
    }
    return { attackerMult, defenderMult, reduction, hits, powerBonus };
  }

  private resolveSide(definition: EffectCommand["definition"], command: EffectCommand): Side | undefined {
    const target = "target" in definition ? definition.target : undefined;
    if (target === "player" || target === "enemy") return target;
    if (target === "self" || !target) return command.actorSide;
    if (target === "target" || target === "opponent") return command.targetSide;
    return command.actorSide;
  }

  applyActionCommands(
    queue: ActionQueue,
    commands: EffectCommand[],
    actionIds: Record<Side, string>,
    nextActionId: () => string,
  ): MechanismEvent[] {
    const events: MechanismEvent[] = [];
    for (const command of commands) {
      const definition = command.definition;
      const target = "target" in definition ? definition.target : undefined;
      const actionId = actionIdFor(target, command.actorSide, actionIds);

      switch (definition.type) {
        case "cancelAction":
          if (actionId && queue.cancel(actionId)) {
            events.push({ type: "action-cancelled", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: command.actorSide, data: { actionId } });
          }
          break;
        case "forceFirst":
          if (actionId && queue.forceFirst(actionId)) {
            events.push({ type: "action-priority-changed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: command.actorSide, data: { actionId, priority: Number.MAX_SAFE_INTEGER } });
          }
          break;
        case "setPriority":
          if (actionId && queue.setPriority(actionId, definition.value)) {
            events.push({ type: "action-priority-changed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: command.actorSide, data: { actionId, priority: definition.value } });
          }
          break;
        case "replaceAction":
          if (actionId && queue.replace(actionId, definition.action)) {
            events.push({ type: "action-replaced", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: command.actorSide, data: { actionId, action: definition.action } });
          }
          break;
        case "insertAction": {
          const side = definition.targetSide ?? command.actorSide;
          if (side) {
            const id = nextActionId();
            queue.enqueue({ id, actorSide: side, action: definition.action, declaredAt: Number.MAX_SAFE_INTEGER, priority: Number.MAX_SAFE_INTEGER, speedSnapshot: Number.MAX_SAFE_INTEGER, source: command.mechanismId, status: "queued" });
            events.push({ type: "action-inserted", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side, data: { actionId: id, action: definition.action } });
          }
          break;
        }
        case "unsupported":
          events.push({ type: "unsupported-effect", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.effectType, side: command.actorSide, data: { reason: definition.reason ?? "未实现效果", impact: "simulation-incomplete" } });
          break;
        default:
          break;
      }
    }
    return events;
  }
}
