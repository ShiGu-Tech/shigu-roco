import type { Action, BattleState, Dict, Side } from "../types";

export type TriggerName =
  | "battleStart"
  | "turnStart"
  | "actionDeclared"
  | "beforeActionOrder"
  | "actionOrderResolved"
  | "beforeAction"
  | "actionResolved"
  | "beforeDamage"
  | "afterDamage"
  | "beforeEffect"
  | "afterEffect"
  | "beforeSwitch"
  | "afterSwitch"
  | "beforeDeath"
  | "afterDeath"
  | "turnEnd"
  | "battleEnd"
  | "skillUsed"
  | "onHit"
  | "statusApplied"
  | "markApplied"
  | "weatherChanged"
  | "skillCooldownReduced";

export type MechanismOwnerType = "skill" | "trait" | "mark" | "weather" | "system";

export interface MechanismDefinition {
  id: string;
  ownerType: MechanismOwnerType;
  ownerId: string;
  trigger: TriggerName;
  when?: Condition[];
  effects: EffectDefinition[];
  priority?: number;
  oncePerTurn?: boolean;
  sourceVisibility?: "public" | "private";
}

export interface MechanismContext {
  state: BattleState;
  trigger: TriggerName;
  sourceId?: string;
  actorSide?: Side;
  targetSide?: Side;
  action?: Action;
  event: Dict;
}

export interface Condition {
  path: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "has";
  value?: unknown;
}

export type EffectDefinition =
  | { type: "dealDamage"; target?: string; category: "Physical" | "Magic" | "Passive"; power: number; skillId?: string; basis?: "formula" | "flat" | "maxHp" | "currentHp" | "stack"; amount?: number; markId?: string }
  | { type: "heal"; target?: string; amount: number; basis?: "flat" | "maxHp" | "currentHp" }
  | { type: "modifyStat"; target?: string; stat: string; mode: "flat" | "percent"; value: number }
  | { type: "modifyCooldown"; target?: string; skillId?: string; delta: number; minimum?: number }
  | { type: "applyStatus"; target?: string; statusId: string; layers?: number; duration?: number }
  | { type: "removeStatus"; target?: string; statusId: string }
  | { type: "modifyMagic"; target?: string; delta: number }
  | { type: "modifyEnergy"; target?: string; delta: number }
  | { type: "modifySwitchLock"; target?: string; delta: number }
  | { type: "applyMark"; target?: string; markId: string; layers?: number; scope?: "sprite" | "team" }
  | { type: "removeMark"; target?: string; markId: string; layers?: number; scope?: "sprite" | "team" }
  | { type: "changeWeather"; weatherId: string; turns?: number }
  | { type: "setPriority"; target?: string; value: number }
  | { type: "forceFirst"; target?: string }
  | { type: "insertAction"; action: Action; targetSide?: Side }
  | { type: "cancelAction"; target?: string }
  | { type: "replaceAction"; target?: string; action: Action }
  | { type: "learnSkill"; target?: string; skillId: string; source?: string; duration?: number }
  | { type: "forgetSkill"; target?: string; skillId: string }
  | { type: "replaceSkill"; target?: string; fromSkillId: string; toSkillId: string; duration?: number }
  | { type: "randomizeSkill"; target?: string; source: string[]; duration?: number }
  | { type: "swapSkillSet"; from: string; to: string; duration?: number }
  | { type: "unsupported"; effectType: string; reason?: string };

export interface EffectCommand {
  type: EffectDefinition["type"];
  definition: EffectDefinition;
  mechanismId: string;
  trigger: TriggerName;
  actorSide?: Side;
  targetSide?: Side;
}

export interface MechanismEvent {
  type: string;
  trigger: TriggerName;
  mechanismId?: string;
  effectType?: string;
  side?: Side;
  data: Dict;
}
