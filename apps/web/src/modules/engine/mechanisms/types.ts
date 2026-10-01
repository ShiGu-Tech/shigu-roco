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

export type MechanismOwnerType = "skill" | "trait" | "status" | "mark" | "weather" | "system";

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

/** 条件：支持单个路径判定、逻辑组合与派生值。派生值在同侧状态里取（层数 / 强化 / 能量 / 回合）。 */
export type Condition =
  | { allOf: Condition[] }
  | { anyOf: Condition[] }
  | { not: Condition }
  | { path: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "has"; value?: unknown; valueFrom?: string };

/** 效果实现体（不含 chance）。 */
export type EffectSpec =
  | { type: "dealDamage"; target?: string; category: "Physical" | "Magic" | "Passive"; power: number; skillId?: string; element?: string; basis?: "formula" | "flat" | "maxHp" | "currentHp" | "stack"; amount?: number; markId?: string }
  | { type: "heal"; target?: string; amount: number; basis?: "flat" | "maxHp" | "currentHp" }
  | { type: "modifyStat"; target?: string; stat: string; mode: "flat" | "percent"; value: number; maxStages?: number }
  /** 伤害修饰：scope=outgoing 攻方输出倍率、incoming 防方承伤倍率；multiply 相乘 / add 相加（+value）。 */
  | { type: "modifyDamage"; target?: string; mode: "multiply" | "add"; value: number; scope?: "outgoing" | "incoming" }
  /** 连击段数（覆盖默认 1）。 */
  | { type: "setHits"; target?: string; hits: number }
  /** 减伤百分比（累加后受 rules.combat.damageReductionCap 限制）。 */
  | { type: "setDamageReduction"; target?: string; percent: number }
  /** 冷却：scope=defense 作用于全部防御技能；skillIdFrom 从上下文取目标技能（如 event.opponentAction.skillId）。 */
  | { type: "modifyCooldown"; target?: string; skillId?: string; skillIdFrom?: string; scope?: "skill" | "defense"; delta: number; minimum?: number }
  /** 状态层数（不再混存 duration）；immuneElements 与目标系别比对，命中即免疫。 */
  | { type: "applyStatus"; target?: string; statusId: string; layers?: number; immuneElements?: string[] }
  /** 状态结算：按策略衰减层数（half/clear）或减去固定层数（delta），DoT 由同机制的 dealDamage 承担。 */
  | { type: "settleStatus"; target?: string; statusId: string; decayLayers?: "half" | "clear"; delta?: number }
  | { type: "removeStatus"; target?: string; statusId: string }
  /** 印记层数结算：按策略衰减（half/clear）或减固定层数（delta），作用于该精灵持有的印记。 */
  | { type: "settleMark"; target?: string; markId: string; decayLayers?: "half" | "clear"; delta?: number }
  | { type: "modifyMagic"; target?: string; delta: number }
  | { type: "modifyEnergy"; target?: string; delta: number }
  | { type: "modifySwitchLock"; target?: string; delta: number }
  | { type: "applyMark"; target?: string; markId: string; layers?: number; scope?: "sprite" | "team"; immuneElements?: string[] }
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
  | { type: "randomizeSkill"; target?: string; skillId?: string; source: string[]; duration?: number }
  | { type: "swapSkillSet"; target?: string; from: string; to: string; duration?: number }
  | { type: "unsupported"; effectType: string; reason?: string };

/** 效果 = 实现体 + 可选概率（0~1，runtime 用确定性种子掷点）。 */
export type EffectDefinition = EffectSpec & { chance?: number };

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
