import { getSkill, getSprite } from "../data";
import { computeDamage } from "../effects/damage";
import { Rng } from "../rng";
import { recordSkillOverride } from "../state";
import type { BattleState, DataBundle, Side } from "../types";
import { asDict, toArray, toNum } from "../types";
import { ActionQueue } from "./action-queue";
import { resolveContextPath } from "./conditions";
import { MechanismRegistry } from "./registry";
import type { EffectCommand, EffectDefinition, MechanismContext, MechanismEvent } from "./types";

interface DamageModifiers {
  attackerMult: number;
  defenderMult: number;
  reduction: number;
  hits: number;
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

/** 机制扩展的运行时外壳：负责收集命令和安全地修改行动队列。 */
export class MechanismRuntime {
  constructor(readonly registry: MechanismRegistry) {}

  dispatch(context: MechanismContext): EffectCommand[] {
    return this.registry.collect(context);
  }

  /** 确定性概率门：无 chance 恒过；chance 以「机制 + 触发 + 序号」派生，保证同状态同种子可复现。 */
  private chancePass(state: BattleState, command: EffectCommand, index: number): boolean {
    const chance = command.definition.chance;
    if (chance === undefined) return true;
    if (chance <= 0) return false;
    if (chance >= 1) return true;
    return new Rng(hashSeed(state, `${command.mechanismId}:${command.trigger}:${index}`)).next() < chance;
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

  /** 动态取值：`from` 为上下文点路径时按当前状态求值，否则返回 fallback。 */
  private dynamicValue(state: BattleState, command: EffectCommand, from: string | undefined, fallback: number): number {
    if (!from) return fallback;
    const context = { state, trigger: command.trigger, actorSide: command.actorSide, targetSide: command.targetSide, event: {} };
    return toNum(resolveContextPath(context, from), fallback);
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
          const amount = definition.basis === "maxHp" ? active.maxHp * definition.amount : definition.basis === "currentHp" ? active.hp * definition.amount : definition.amount;
          active.hp = Math.min(active.maxHp, active.hp + Math.floor(amount));
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
          active.energy = Math.max(0, active.energy + definition.delta);
          events.push({ type: "energy-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before, after: active.energy, delta: definition.delta } });
          break;
        }
        case "modifySwitchLock": {
          const side = targetSide === "player" ? state.player : state.enemy;
          const before = side.switchLock;
          side.switchLock = Math.max(0, before + definition.delta);
          events.push({ type: "switch-lock-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { before, after: side.switchLock, delta: definition.delta } });
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
          const delta = Math.floor(this.dynamicValue(state, command, definition.layersFrom, definition.layers ?? 1));
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
          const wanted = Math.max(0, Math.floor(this.dynamicValue(state, command, definition.layersFrom, definition.layers ?? 0)));
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
        case "removeMark": {
          if (!active || !targetSide) break;
          const side = targetSide === "player" ? state.player : state.enemy;
          const markDef = bundle?.marks[definition.markId];
          const isTeam = definition.scope === "team" || (!definition.scope && (markDef?.carrier === "field" || markDef?.carrier === "team"));
          const store = isTeam ? side.teamMarks : active.marks;
          const before = store[definition.markId] ?? 0;
          const after = Math.max(0, before - (definition.layers ?? before));
          if (after === 0) delete store[definition.markId];
          else store[definition.markId] = after;
          events.push({ type: "mark-removed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId, scope: isTeam ? "team" : "sprite", before, after } });
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
        case "applyStatus": {
          if (!active || !targetSide) break;
          if (this.isImmune(bundle, active.spriteId, definition.immuneElements)) {
            events.push({ type: "status-immune", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId } });
            break;
          }
          const before = active.statuses[definition.statusId] ?? 0;
          const delta = definition.layers ?? 1;
          active.statuses[definition.statusId] = before + delta;
          events.push({ type: "status-applied", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId, before, after: active.statuses[definition.statusId], layers: delta } });
          break;
        }
        case "settleStatus": {
          if (!active || !targetSide) break;
          const before = active.statuses[definition.statusId] ?? 0;
          if (before <= 0) break;
          let after = before;
          if (typeof definition.delta === "number") after = Math.max(0, before - definition.delta);
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
          const value = definition.mode === "percent" && Math.abs(definition.value) > 1 ? definition.value / 100 : definition.value;
          const bucket = value >= 0 ? active.buffs : active.debuffs;
          const cap = definition.maxStages ?? toNum(asDict(bundle?.rules.stage).cap, Number.POSITIVE_INFINITY);
          const before = bucket[definition.stat] ?? 0;
          bucket[definition.stat] = Math.max(-cap, Math.min(cap, before + value));
          events.push({ type: "stat-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { stat: definition.stat, before, after: bucket[definition.stat], mode: definition.mode } });
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
          const pool = definition.source.filter((id) => id && id !== current);
          if (!current || !pool.length) break;
          const rng = new Rng(hashSeed(state, `${command.mechanismId}:${state.turn}`));
          const picked = pool[rng.int(pool.length)];
          active.loadout = active.loadout.includes(current)
            ? active.loadout.map((id) => (id === current ? picked : id))
            : [...active.loadout, picked];
          recordSkillOverride(active, picked, current, definition.duration ? state.turn + definition.duration : 0);
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
        default:
          break;
      }
    }

    if (depth < 4) {
      for (const event of [...events]) {
        const trigger = event.type === "status-applied" ? "statusApplied" : event.type === "mark-applied" ? "markApplied" : null;
        if (!trigger) continue;
        const cascaded = this.dispatch({
          state,
          trigger,
          actorSide: event.side,
          targetSide: event.side === "player" ? "enemy" : event.side === "enemy" ? "player" : undefined,
          event: event.data,
        });
        events.push(...this.applyStateCommands(state, cascaded, bundle, depth + 1));
        if (bundle) events.push(...this.applyDamageCommands(state, bundle, cascaded));
      }
    }
    return events;
  }

  applyDamageCommands(state: BattleState, bundle: DataBundle, commands: EffectCommand[]): MechanismEvent[] {
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
      const skill = definition.skillId ? getSkill(bundle, definition.skillId) : { category: definition.category, power: definition.power };
      let damage: number;
      let modifiers: DamageModifiers | null = null;
      if (definition.basis && definition.basis !== "formula") {
        const amount = definition.amount ?? definition.power;
        damage = definition.basis === "maxHp" ? Math.floor(target.maxHp * amount) : definition.basis === "currentHp" ? Math.floor(target.hp * amount) : definition.basis === "stack" ? Math.floor(target.maxHp * amount * (target.marks[definition.markId ?? ""] ?? 0)) : Math.floor(amount);
      } else {
        modifiers = this.damageModifiers(state, attackerSide, targetSide, definition);
        const result = computeDamage(bundle, attackerDef, targetDef, attacker, target, skill, {
          weatherId: state.weather?.id ?? null,
          attackerTraitMult: modifiers.attackerMult,
          defenderTraitMult: modifiers.defenderMult,
          damageReduction: modifiers.reduction,
          hits: modifiers.hits,
        });
        damage = result.damage;
      }
      target.hp = Math.max(0, target.hp - damage);
      events.push({ type: "damage", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { value: damage, attackerSide, skillId: definition.skillId, damageType: definition.category, modifiers } });
    }
    return events;
  }

  /** 结算一次 dealDamage 前，按 `beforeDamage` 收集攻/防伤害修饰（攻方倍率 / 防方倍率 / 减伤 / 连击）。 */
  private damageModifiers(state: BattleState, attackerSide: Side, targetSide: Side, definition: EffectDefinition): DamageModifiers {
    const commands = this.dispatch({
      state,
      trigger: "beforeDamage",
      actorSide: attackerSide,
      targetSide,
      event: {
        skillId: definition.type === "dealDamage" ? definition.skillId : undefined,
        category: definition.type === "dealDamage" ? definition.category : undefined,
        power: definition.type === "dealDamage" ? definition.power : undefined,
      },
    });
    let attackerMult = 1;
    let defenderMult = 1;
    let reduction = 0;
    let hits = 1;
    for (const command of commands) {
      const d = command.definition;
      if (d.type === "modifyDamage") {
        const outgoing = d.scope ? d.scope === "outgoing" : command.actorSide === attackerSide;
        const factor = d.mode === "add" ? 1 + d.value : d.value;
        if (outgoing) attackerMult *= factor;
        else defenderMult *= factor;
      } else if (d.type === "setHits") {
        if (d.markId) {
          const holder = targetSide === "player" ? state.player.active : state.enemy.active;
          const stacks = toNum(holder.marks?.[d.markId], 0);
          hits = Math.max(1, Math.floor((d.base ?? 1) + (d.perStack ?? 1) * stacks));
        } else {
          hits = Math.max(1, Math.floor(d.hits ?? 1));
        }
      } else if (d.type === "setDamageReduction") {
        reduction += d.percent;
      }
    }
    return { attackerMult, defenderMult, reduction, hits };
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
