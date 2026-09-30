import { getSkill, getSprite } from "../data";
import { computeDamage } from "../effects/damage";
import { Rng } from "../rng";
import { recordSkillOverride } from "../state";
import type { BattleState, DataBundle, Side } from "../types";
import { ActionQueue } from "./action-queue";
import { MechanismRegistry } from "./registry";
import type { EffectCommand, MechanismContext, MechanismEvent } from "./types";

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

  applyStateCommands(state: BattleState, commands: EffectCommand[], bundle?: DataBundle, depth = 0): MechanismEvent[] {
    const events: MechanismEvent[] = [];
    for (const command of commands) {
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
          const side = targetSide === "player" ? state.player : state.enemy;
          const markDef = bundle?.marks[definition.markId];
          const isTeam = definition.scope === "team" || (!definition.scope && (markDef?.carrier === "field" || markDef?.carrier === "team"));
          const store = isTeam ? side.teamMarks : active.marks;
          const before = store[definition.markId] ?? 0;
          const cap = bundle?.marks[definition.markId]?.maxStack;
          store[definition.markId] = Math.min(typeof cap === "number" ? cap : Number.MAX_SAFE_INTEGER, before + (definition.layers ?? 1));
          events.push({ type: "mark-applied", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { markId: definition.markId, scope: isTeam ? "team" : "sprite", before, after: store[definition.markId] } });
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
        case "changeWeather":
          state.weather = { id: definition.weatherId, turnsLeft: definition.turns ?? 1 };
          events.push({ type: "weather-changed", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, data: { weatherId: definition.weatherId, turns: state.weather.turnsLeft } });
          break;
        case "applyStatus": {
          if (!active || !targetSide) break;
          const before = active.statuses[definition.statusId] ?? 0;
          const delta = definition.layers ?? 1;
          active.statuses[definition.statusId] = definition.duration ?? before + delta;
          events.push({ type: "status-applied", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { statusId: definition.statusId, before, after: active.statuses[definition.statusId], layers: delta } });
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
          const skillId = definition.skillId;
          if (!skillId) break;
          active.cooldowns ??= {};
          const before = active.cooldowns[skillId] ?? 0;
          active.cooldowns[skillId] = Math.max(definition.minimum ?? 0, before + definition.delta);
          events.push({ type: "cooldown-modified", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { skillId, before, after: active.cooldowns[skillId], delta: definition.delta } });
          break;
        }
        case "modifyStat": {
          if (!active || !targetSide) break;
          const value = definition.mode === "percent" && Math.abs(definition.value) > 1 ? definition.value / 100 : definition.value;
          const bucket = value >= 0 ? active.buffs : active.debuffs;
          const before = bucket[definition.stat] ?? 0;
          bucket[definition.stat] = before + value;
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
    for (const command of commands) {
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
      if (definition.basis && definition.basis !== "formula") {
        const amount = definition.amount ?? definition.power;
        damage = definition.basis === "maxHp" ? Math.floor(target.maxHp * amount) : definition.basis === "currentHp" ? Math.floor(target.hp * amount) : definition.basis === "stack" ? Math.floor(target.maxHp * amount * (target.marks[definition.markId ?? ""] ?? 0)) : Math.floor(amount);
      } else {
      const result = computeDamage(bundle, attackerDef, targetDef, attacker, target, skill, { weatherId: state.weather?.id ?? null });
        damage = result.damage;
      }
      target.hp = Math.max(0, target.hp - damage);
      events.push({ type: "damage", trigger: command.trigger, mechanismId: command.mechanismId, effectType: definition.type, side: targetSide, data: { value: damage, attackerSide, skillId: definition.skillId, damageType: definition.category } });
    }
    return events;
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
