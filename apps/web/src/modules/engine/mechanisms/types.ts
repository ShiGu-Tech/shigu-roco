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
  | "onEntry"
  | "beforeFatal"
  | "beforeDeath"
  | "afterDeath"
  | "turnEnd"
  | "battleEnd"
  | "skillUsed"
  | "passive"
  | "onHit"
  | "statusApplied"
  | "markApplied"
  | "statusReached"
  | "markReached"
  | "buffGained"
  | "debuffGained"
  | "weatherChanged"
  | "skillCooldownReduced"
  | "energyGained"
  | "charged"
  | "heal"
  | "statusDamage";

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
  | { path: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "has" | "contains"; value?: unknown; valueFrom?: DynamicRef };

/** 动态取值：点路径 + 系数 + 偏移（如「每层印记 ×2」= { path, scale: 2 }）。`path` 末尾 `*` 表示合计对象数值。
 *  需要非线性时可给 `terms`（对取值做多项式，如 `N²+24N−24` → [{ coef:1, power:2 },{ coef:24, power:1 },{ coef:-24, power:0 }]）。 */
export interface DynamicValue {
  path: string;
  scale?: number;
  offset?: number;
  round?: "floor" | "ceil" | "round" | "none";
  terms?: { coef: number; power: number }[];
  /** `path` 指向技能 id 数组时（如 `self.active.loadout`），按图鉴条目属性筛选计数（需 bundle）。 */
  count?: { element?: string; category?: string; actionType?: string };
  /** `path` 指向对象（如 `self.active.debuffs`）时，取其键数量（如「每有 1 层 / 种减益」）。 */
  countKeys?: boolean;
}

/** 动态引用：字符串等价于 `{ path }`。 */
export type DynamicRef = string | DynamicValue;

/** 效果实现体（不含 chance）。 */
export type EffectSpec =
  | { type: "dealDamage"; target?: string; category: "Physical" | "Magic" | "Passive"; power: number; powerFrom?: DynamicValue; skillId?: string; element?: string; basis?: "formula" | "flat" | "maxHp" | "currentHp" | "stack"; amount?: number; markId?: string }
  | { type: "heal"; target?: string; amount: number; amountFrom?: DynamicValue; basis?: "flat" | "maxHp" | "currentHp" }
  | { type: "modifyStat"; target?: string; stat: string; mode: "flat" | "percent"; value: number; valueFrom?: DynamicValue; maxStages?: number }
  /** 强化域 · 属性增益 / 减益层数缩放：按 `polarity`（省略 = 全部）对某属性（省略 = 全部）做 `factor` 乘 + `delta` 加。 */
  | { type: "scaleStat"; target?: string; polarity?: "buff" | "debuff" | "all"; stat?: string; factor?: number; delta?: number }
  /** 强化域 · 增益转状态：把目标全部增益（合计层数 × factor）转为 `statusId` 层数并清空增益。 */
  | { type: "convertBuffToStatus"; target?: string; statusId: string; factor?: number }
  /** 伤害修饰：scope=outgoing 攻方输出倍率、incoming 防方承伤倍率；multiply 相乘 / add 相加（+value）。 */
  | { type: "modifyDamage"; target?: string; mode: "multiply" | "add"; value: number; scope?: "outgoing" | "incoming" }
  /** 技能栏域 · 条件威力加成：在 `beforeDamage` 收集，累加到本次 `dealDamage` 的有效威力（先于属性 / STAB）。 */
  | { type: "addPower"; target?: string; value: number; valueFrom?: DynamicValue }
  /** 技能栏域 · 传动：把目标侧 active 的 `skillId`（默认机制 ownerId）在 `loadout` 内向下移 `slots` 位（循环）。 */
  | { type: "rotateLoadout"; target?: string; skillId?: string; slots: number }
  /** 连击段数（覆盖默认 1）；给 markId 时按目标持有该印记层数动态计算 base + perStack×层数；hitsFrom 为上下文点路径。 */
  | { type: "setHits"; target?: string; hits?: number; markId?: string; base?: number; perStack?: number; hitsFrom?: DynamicRef }
  /** 减伤百分比（累加后受 rules.combat.damageReductionCap 限制）。 */
  | { type: "setDamageReduction"; target?: string; percent: number; percentFrom?: DynamicValue }
  /** 冷却：scope=defense 作用于全部防御技能；skillIdFrom 从上下文取目标技能（如 event.opponentAction.skillId）。 */
  | { type: "modifyCooldown"; target?: string; skillId?: string; skillIdFrom?: string; scope?: "skill" | "defense"; delta: number; minimum?: number }
  /** 状态层数（不再混存 duration）；immuneElements 与目标系别比对，命中即免疫。 */
  | { type: "applyStatus"; target?: string; statusId: string; layers?: number; layersFrom?: DynamicRef; immuneElements?: string[] }
  /** 状态设为指定层数（0 = 移除）；`layersFrom` 为上下文点路径动态取值。 */
  | { type: "setStatus"; target?: string; statusId: string; layers?: number; layersFrom?: DynamicRef }
  /** 状态缩放：对指定状态（省略 = 全部）做 `factor` 乘 + `delta` 加（如减益翻倍）。 */
  | { type: "scaleStatus"; target?: string; statusId?: string; factor?: number; delta?: number }
  /** 状态结算：按策略衰减层数（half/clear）或减去固定层数（delta），DoT 由同机制的 dealDamage 承担。 */
  | { type: "settleStatus"; target?: string; statusId: string; decayLayers?: "half" | "clear"; delta?: number }
  | { type: "removeStatus"; target?: string; statusId: string }
  /** 印记层数结算：按策略衰减（half/clear）或减固定层数（delta），作用于该精灵持有的印记。 */
  | { type: "settleMark"; target?: string; markId: string; decayLayers?: "half" | "clear"; delta?: number }
  /** 印记设为指定层数（0 = 移除）；`layersFrom` 为上下文点路径动态取值（如 target.active.marks.starfall-mark）。 */
  | { type: "setMark"; target?: string; markId: string; layers?: number; layersFrom?: DynamicRef; scope?: "sprite" | "team" }
  /** 印记缩放：对指定印记（省略 = 全部）做 `factor` 乘 + `delta` 加。 */
  | { type: "scaleMark"; target?: string; markId?: string; factor?: number; delta?: number; scope?: "sprite" | "team" }
  /** 印记转移 / 偷取：把 from 侧（默认 opponent）的印记移到 to 侧（默认 self）；amount 为总层数（all = 全部）。 */
  | { type: "transferMark"; markId?: string; amount?: number | "all"; from?: "self" | "opponent"; to?: "self" | "opponent" }
  /** 印记收拢：把目标身上的印记合计层数收拢成 `toMarkId` 一种。 */
  | { type: "transformMark"; target?: string; toMarkId: string; scope?: "sprite" | "team" }
  /** 强化域 · 驱散 / 偷取增益减益：按 `stat`（省略 = 全部）与 `polarity` 移除 `layers` 层（"all" 或省略 = 清空）；`limit` 限制作用的属性种类数。 */
  | { type: "clearStat"; target?: string; stat?: string; layers?: number | "all"; polarity?: "buff" | "debuff" | "all"; limit?: number }
  /** 能耗域 · 技能能耗修正：对某技能 / 全体 / 攻击技 / 防御技叠加 `delta` 或按 `multiply` 缩放；
   *  `elements` / `excludeElements` 按技能元素筛选；`duration` / `turns` 时效；`oncePerTurn` 每回合限次；
   *  `hidden` 是否对 UI 隐藏来源；`dispellable` 是否可被驱散（默认 false，仅名义 debuff 置 true）。 */
  | { type: "modifySkillCost"; target?: string; skillId?: string; scope?: "skill" | "all" | "attack" | "defense"; slots?: number[]; elements?: string[]; excludeElements?: string[]; delta?: number; deltaFrom?: DynamicValue; multiply?: number; mode?: "add" | "set"; key?: string; duration?: "permanent" | "turns" | "nextAction" | "aura"; turns?: number; oncePerTurn?: boolean; hidden?: boolean; dispellable?: boolean }
  /** 能耗域 · 驱散能耗修正：移除目标身上 `dispellable` 且（默认）有害的条目。 */
  | { type: "clearCostMod"; target?: string; all?: boolean }
  /** 行动域 · 强制换人（引擎只标记 `forcedSwitch`，由前端补一次换人）。 */
  | { type: "forceSwitch"; target?: string }
  /** 行动域 · 脱离（强制换人 + 解除离场锁）。 */
  | { type: "escape"; target?: string }
  /** 行动域 · 允许被限制的换人（清除离场锁）。 */
  | { type: "allowSwitch"; target?: string }
  /** 交换域 · 自身与对手交换 `hpRatio`（生命比例）/ `skills`（技能栏）/ `stats`（增益与减益）。 */
  | { type: "swap"; target?: string; what: "hpRatio" | "skills" | "stats" }
  /** 生命域 · 把自身生命比例设为与对手相同（`from` 默认 opponent）。 */
  | { type: "setHpRatio"; target?: string; from?: "opponent" }
  /** 行动域 · 入场继承：把 `effects` 排入目标侧「下个入场精灵」队列，换人时执行。 */
  | { type: "scheduleEntry"; target?: string; effects: EffectSpec[] }
  /** 延迟域 · 把 `effects` 排入目标侧队列，于 `delay` 回合后的 `timing` 结算（默认下回合 turnStart）。 */
  | { type: "scheduleEffect"; target?: string; effects: EffectSpec[]; delay?: number; timing?: "turnStart" | "turnEnd" }
  /** 入场继承 · 继承离场精灵的强化：仅在 `scheduleEntry.effects` 内有效，于换人时由模拟器执行。 */
  | { type: "inheritStat"; polarity?: "buff" | "debuff" | "all" }
  | { type: "modifyMagic"; target?: string; delta: number }
  | { type: "modifyEnergy"; target?: string; delta: number; deltaFrom?: DynamicValue }
  | { type: "modifySwitchLock"; target?: string; delta: number }
  | { type: "applyMark"; target?: string; markId: string; layers?: number; layersFrom?: DynamicRef; scope?: "sprite" | "team"; immuneElements?: string[] }
  /** 印记消耗：驱散目标指定（省略 = 全部）印记。`effectsPerLayer` 每层执行一次（自动累加）；
   *  `effectsOnConsume` 在消耗后执行一次，可用 `event.consumed` 读取本次消耗的总层数。 */
  | { type: "consumeMark"; target?: string; markId?: string; scope?: "sprite" | "team"; effectsPerLayer?: EffectSpec[]; effectsOnConsume?: EffectSpec[] }
  | { type: "removeMark"; target?: string; markId?: string; layers?: number; scope?: "sprite" | "team" }
  | { type: "changeWeather"; weatherId: string; turns?: number }
  /** 蓄力域 · 本技能进入蓄力（下回合自动释放）；加离场锁防止蓄力期间被换下。 */
  | { type: "beginCharge"; skillId?: string; choice?: 0 | 1 }
  /** 随机层数减益 · 向目标随机属性各扣 `layers` 层（确定性种子）。 */
  | { type: "randomStatDebuff"; target?: string; layers: number; stats?: string[] }
  /** 奉献域 · 向自身队伍加入 `count` 个奉献（`key` 省略 = 随机：威力/连击/能耗/吸血）。 */
  | { type: "grantDedication"; target?: string; key?: "power" | "combo" | "cost" | "lifesteal"; value?: number; count?: number }
  /** 奉献域 · 消耗队伍第一个奉献并作用到 `skillId` 技能本次使用（供带「受奉献影响」tag 的技能）。 */
  | { type: "consumeDedication"; target?: string; skillId: string }
  /** 天气域 · 延长当前天气回合数（`weatherId` 省略 = 不限；不匹配则不生效）。 */
  | { type: "modifyWeatherTurns"; weatherId?: string; delta: number }
  | { type: "setPriority"; target?: string; value: number }
  | { type: "forceFirst"; target?: string }
  | { type: "insertAction"; action: Action; targetSide?: Side }
  | { type: "cancelAction"; target?: string }
  | { type: "replaceAction"; target?: string; action: Action }
  | { type: "learnSkill"; target?: string; skillId: string; source?: string; duration?: number }
  | { type: "forgetSkill"; target?: string; skillId: string }
  | { type: "replaceSkill"; target?: string; fromSkillId: string; toSkillId: string; duration?: number }
  | { type: "randomizeSkill"; target?: string; skillId?: string; source?: string[]; sourceFrom?: string; duration?: number; costDelta?: number }
  | { type: "swapSkillSet"; target?: string; from: string; to: string; duration?: number }
  /** 记忆域 · 计数器：`target.active.counters[key] += delta`。 */
  | { type: "addCounter"; target?: string; key: string; delta: number }
  /** 记忆域 · 计数器：设为指定值（`valueFrom` 为上下文点路径动态取值）。 */
  | { type: "setCounter"; target?: string; key: string; value?: number; valueFrom?: DynamicRef }
  /** 记忆域 · 计数器：清除指定 key（省略 = 全部）。 */
  | { type: "clearCounter"; target?: string; key?: string }
  /** 记忆域 · 技能永久修正：对某技能叠加威力 / 能耗 / 连击 / 先手的持久 delta。 */
  | { type: "modifySkill"; target?: string; skillId: string; power?: number; cost?: number; hits?: number; priority?: number }
  /** 规则覆盖通道：按 `passive` 触发器收集，覆盖 `rules.*` 默认值（如印记上限 / 异种互斥）。key 用点路径。 */
  | { type: "setRuleModifier"; target?: string; key: string; value: number | boolean }
  | { type: "unsupported"; effectType: string; reason?: string };

/** 效果 = 实现体 + 可选概率（0~1，runtime 用确定性种子掷点）。 */
export type EffectDefinition = EffectSpec & { chance?: number };

export interface EffectCommand {
  type: EffectDefinition["type"];
  definition: EffectDefinition;
  mechanismId: string;
  /** 机制归属（技能 / 特性 / 状态…），供能耗条目记录来源。 */
  ownerType?: MechanismOwnerType;
  ownerId?: string;
  trigger: TriggerName;
  actorSide?: Side;
  targetSide?: Side;
  /** 命令级事件负载（供嵌套效果读取，如 consumeMark 暴露的 `consumed`）。 */
  event?: Dict;
  /** 效果在机制内的原序（chance 盐粒用）；编译程序按效果原序携带，缺省回退批内位置。 */
  effectIndex?: number;
}

/** 延迟效果条目（`SideState.pendingEffects`）。 */
export interface PendingEffect {
  dueTurn: number;
  timing: "turnStart" | "turnEnd";
  effects: EffectSpec[];
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
