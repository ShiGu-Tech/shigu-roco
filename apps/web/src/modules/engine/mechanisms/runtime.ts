import { getSkill, getSprite } from "../data";
import { computeDamage } from "../effects/damage";
import type { BattleState, DataBundle, Side } from "../types";
import { ActionQueue } from "./action-queue";
import { MechanismRegistry } from "./registry";
import type { EffectCommand, MechanismContext, MechanismEvent } from "./types";

function actionIdFor(target: string | undefined, actorSide: Side | undefined, actionIds: Record<Side, string>): string | undefined {
  if (target?.startsWith("action:")) return target.slice("action:".length);
  if (target === "player" || target === "enemy") return actionIds[target];
  return actorSide ? actionIds[actorSide] : undefined;
}

/** 机制扩展的运行时外壳：负责收集命令和安全地修改行动队列。 */
export class MechanismRuntime {
  constructor(readonly registry: MechanismRegistry) {}

  dispatch(context: MechanismContext): EffectCommand[] {
    return this.registry.collect(context);
  }

  applyStateCommands(state: BattleState, commands: EffectCommand[], bundle?: DataBundle): MechanismEvent[] {
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
        default:
          break;
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
