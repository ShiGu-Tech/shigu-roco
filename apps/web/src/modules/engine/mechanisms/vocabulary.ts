/** 机制 DSL 词汇元数据（工作台 G3a）：trigger / 效果命令 / 条件算子 / 动态取值 的运行时展示 schema。
 *
 * 心智：这是「指令集的展示元数据」，属于引擎词汇而非游戏内容——不认识任何具体技能 / 印记。
 * UI 只经 `GET /api/engine/workbench/schema` 消费本表，不硬编码；漂移由 `__tests__/vocabulary.test.ts` 守卫：
 * `data/mechanisms.json` 出现的每个 trigger / effect type 必须在本表内。
 */

export type EffectDomain =
  | "damage"
  | "heal"
  | "stat"
  | "status"
  | "mark"
  | "cost"
  | "cooldown"
  | "energy"
  | "magic"
  | "action"
  | "skill"
  | "counter"
  | "rule"
  | "weather"
  | "schedule"
  | "other";

export interface TriggerMeta {
  name: string;
  title: string;
  /** 生命周期分组（调试台 trace 按此分段高亮）。 */
  phase: "turn" | "action" | "damage" | "switch" | "death" | "entity" | "other";
}

export interface EffectVocabulary {
  type: string;
  title: string;
  domain: EffectDomain;
  /** 参数名 → 中文标签（未列出的参数 UI 回退展示原字段名）。 */
  params?: Record<string, string>;
}

// ---------------------------------------------------------------- 触发器

export const TRIGGER_VOCABULARY: readonly TriggerMeta[] = [
  { name: "battleStart", title: "对局开始", phase: "turn" },
  { name: "turnStart", title: "回合开始", phase: "turn" },
  { name: "turnEnd", title: "回合结束", phase: "turn" },
  { name: "battleEnd", title: "对局结束", phase: "turn" },
  { name: "actionDeclared", title: "行动宣告", phase: "action" },
  { name: "beforeActionOrder", title: "行动排序前", phase: "action" },
  { name: "actionOrderResolved", title: "行动排序后", phase: "action" },
  { name: "beforeAction", title: "行动执行前", phase: "action" },
  { name: "actionResolved", title: "行动结算后", phase: "action" },
  { name: "skillUsed", title: "技能使用", phase: "action" },
  { name: "beforeDamage", title: "伤害计算前", phase: "damage" },
  { name: "onHit", title: "命中时", phase: "damage" },
  { name: "afterDamage", title: "伤害结算后", phase: "damage" },
  { name: "beforeEffect", title: "效果执行前", phase: "damage" },
  { name: "afterEffect", title: "效果执行后", phase: "damage" },
  { name: "beforeSwitch", title: "换人前", phase: "switch" },
  { name: "afterSwitch", title: "换人后", phase: "switch" },
  { name: "onEntry", title: "入场", phase: "switch" },
  { name: "beforeDeath", title: "阵亡前", phase: "death" },
  { name: "afterDeath", title: "阵亡后", phase: "death" },
  { name: "statusApplied", title: "状态施加", phase: "entity" },
  { name: "markApplied", title: "印记施加", phase: "entity" },
  { name: "statusReached", title: "状态层数阈值", phase: "entity" },
  { name: "markReached", title: "印记层数阈值", phase: "entity" },
  { name: "buffGained", title: "获得增益", phase: "entity" },
  { name: "debuffGained", title: "获得减益", phase: "entity" },
  { name: "weatherChanged", title: "天气变化", phase: "entity" },
  { name: "skillCooldownReduced", title: "冷却减少", phase: "other" },
  { name: "passive", title: "被动常驻", phase: "other" },
] as const;

export const TRIGGER_NAMES: readonly string[] = TRIGGER_VOCABULARY.map((t) => t.name);

// ---------------------------------------------------------------- 效果命令

export const EFFECT_VOCABULARY: readonly EffectVocabulary[] = [
  // 伤害 / 治疗
  { type: "dealDamage", title: "造成伤害", domain: "damage", params: { target: "目标", category: "伤害类型", power: "威力", powerFrom: "威力取值", skillId: "关联技能", element: "伤害系别", basis: "基准", amount: "数值", markId: "关联印记" } },
  { type: "modifyDamage", title: "伤害修饰", domain: "damage", params: { target: "目标", mode: "方式", value: "数值", scope: "作用面" } },
  { type: "setHits", title: "连击段数", domain: "damage", params: { target: "目标", hits: "段数", markId: "按印记", base: "基础段数", perStack: "每层加段", hitsFrom: "段数取值" } },
  { type: "swap", title: "交换", domain: "stat", params: { target: "目标", what: "交换项" } },
  { type: "setHpRatio", title: "生命比例设同", domain: "stat", params: { target: "目标", from: "取自" } },
  { type: "setDamageReduction", title: "减伤", domain: "damage", params: { target: "目标", percent: "减伤%", percentFrom: "减伤取值" } },
  { type: "heal", title: "治疗", domain: "heal", params: { target: "目标", amount: "数值", amountFrom: "数值取值", basis: "基准" } },
  // 强化
  { type: "modifyStat", title: "属性增减益", domain: "stat", params: { target: "目标", stat: "属性", mode: "方式", value: "数值", valueFrom: "数值取值", maxStages: "层数上限" } },
  { type: "clearStat", title: "驱散增减益", domain: "stat", params: { target: "目标", stat: "属性", layers: "层数", polarity: "极性", limit: "种类上限" } },
  // 状态
  { type: "applyStatus", title: "施加状态", domain: "status", params: { target: "目标", statusId: "状态", layers: "层数", immuneElements: "免疫系别" } },
  { type: "setStatus", title: "设置状态层数", domain: "status", params: { target: "目标", statusId: "状态", layers: "层数", layersFrom: "层数取值" } },
  { type: "scaleStatus", title: "状态缩放", domain: "status", params: { target: "目标", statusId: "状态", factor: "倍率", delta: "增减" } },
  { type: "settleStatus", title: "状态结算", domain: "status", params: { target: "目标", statusId: "状态", decayLayers: "衰减策略", delta: "固定减层" } },
  { type: "removeStatus", title: "移除状态", domain: "status", params: { target: "目标", statusId: "状态" } },
  // 印记
  { type: "applyMark", title: "施加印记", domain: "mark", params: { target: "目标", markId: "印记", layers: "层数", layersFrom: "层数取值", scope: "载体", immuneElements: "免疫系别" } },
  { type: "setMark", title: "设置印记层数", domain: "mark", params: { target: "目标", markId: "印记", layers: "层数", layersFrom: "层数取值", scope: "载体" } },
  { type: "scaleMark", title: "印记缩放", domain: "mark", params: { target: "目标", markId: "印记", factor: "倍率", delta: "增减", scope: "载体" } },
  { type: "settleMark", title: "印记结算", domain: "mark", params: { target: "目标", markId: "印记", decayLayers: "衰减策略", delta: "固定减层" } },
  { type: "transferMark", title: "印记转移", domain: "mark", params: { markId: "印记", amount: "层数", from: "来源", to: "去向" } },
  { type: "transformMark", title: "印记收拢", domain: "mark", params: { target: "目标", toMarkId: "收拢为", scope: "载体" } },
  { type: "consumeMark", title: "消耗印记", domain: "mark", params: { target: "目标", markId: "印记", scope: "载体", effectsPerLayer: "每层效果", effectsOnConsume: "消耗后效果" } },
  { type: "removeMark", title: "移除印记", domain: "mark", params: { target: "目标", markId: "印记", layers: "层数", scope: "载体" } },
  // 能耗 / 冷却
  { type: "modifySkillCost", title: "能耗修正", domain: "cost", params: { target: "目标", skillId: "技能", scope: "作用域", slots: "槽位", elements: "系别", excludeElements: "排除系别", delta: "增减", deltaFrom: "增减取值", multiply: "倍率", mode: "方式", key: "条目键", duration: "时效", turns: "回合数", oncePerTurn: "每回一次", hidden: "隐藏", dispellable: "可驱散" } },
  { type: "clearCostMod", title: "驱散能耗修正", domain: "cost", params: { target: "目标", all: "全部" } },
  { type: "modifyCooldown", title: "冷却修正", domain: "cooldown", params: { target: "目标", skillId: "技能", skillIdFrom: "技能取值", scope: "作用域", delta: "增减", minimum: "下限" } },
  // 能量 / 魔力
  { type: "modifyEnergy", title: "能量修正", domain: "energy", params: { target: "目标", delta: "增减", deltaFrom: "增减取值" } },
  { type: "modifyMagic", title: "魔力修正", domain: "magic", params: { target: "目标", delta: "增减" } },
  // 行动
  { type: "setPriority", title: "设置先手", domain: "action", params: { target: "目标", value: "先手值" } },
  { type: "forceFirst", title: "强制先手", domain: "action", params: { target: "目标" } },
  { type: "insertAction", title: "插入行动", domain: "action", params: { action: "行动", targetSide: "插入侧" } },
  { type: "cancelAction", title: "取消行动", domain: "action", params: { target: "目标" } },
  { type: "replaceAction", title: "替换行动", domain: "action", params: { target: "目标", action: "行动" } },
  { type: "forceSwitch", title: "强制换人", domain: "action", params: { target: "目标" } },
  { type: "escape", title: "脱离", domain: "action", params: { target: "目标" } },
  { type: "allowSwitch", title: "解除换人限制", domain: "action", params: { target: "目标" } },
  { type: "modifySwitchLock", title: "换人锁修正", domain: "action", params: { target: "目标", delta: "增减" } },
  // 技能栏
  { type: "addPower", title: "条件威力加成", domain: "skill", params: { target: "目标", value: "加成", valueFrom: "加成取值" } },
  { type: "rotateLoadout", title: "技能栏轮转", domain: "skill", params: { target: "目标", skillId: "技能", slots: "位移" } },
  { type: "learnSkill", title: "学习技能", domain: "skill", params: { target: "目标", skillId: "技能", source: "来源", duration: "时效" } },
  { type: "forgetSkill", title: "遗忘技能", domain: "skill", params: { target: "目标", skillId: "技能" } },
  { type: "replaceSkill", title: "替换技能", domain: "skill", params: { target: "目标", fromSkillId: "原技能", toSkillId: "新技能", duration: "时效" } },
  { type: "randomizeSkill", title: "随机技能", domain: "skill", params: { target: "目标", skillId: "目标技能", source: "候选池", duration: "时效" } },
  { type: "swapSkillSet", title: "交换技能组", domain: "skill", params: { target: "目标", from: "自", to: "至", duration: "时效" } },
  { type: "modifySkill", title: "技能永久修正", domain: "skill", params: { target: "目标", skillId: "技能", power: "威力", cost: "能耗", hits: "连击", priority: "先手" } },
  // 记忆
  { type: "addCounter", title: "计数器增减", domain: "counter", params: { target: "目标", key: "键", delta: "增减" } },
  { type: "setCounter", title: "设置计数器", domain: "counter", params: { target: "目标", key: "键", value: "值", valueFrom: "取值" } },
  { type: "clearCounter", title: "清除计数器", domain: "counter", params: { target: "目标", key: "键" } },
  // 调度
  { type: "scheduleEntry", title: "入场继承调度", domain: "schedule", params: { target: "目标", effects: "继承效果" } },
  { type: "scheduleEffect", title: "延迟效果", domain: "schedule", params: { target: "目标", effects: "延迟效果", delay: "延迟回合", timing: "结算时机" } },
  { type: "inheritStat", title: "入场继承强化", domain: "schedule", params: { polarity: "极性" } },
  // 规则 / 天气
  { type: "setRuleModifier", title: "规则覆盖", domain: "rule", params: { target: "目标", key: "规则键", value: "覆盖值" } },
  { type: "changeWeather", title: "改变天气", domain: "weather", params: { weatherId: "天气", turns: "持续回合" } },
  { type: "modifyWeatherTurns", title: "延长天气", domain: "weather", params: { weatherId: "天气", delta: "回合增减" } },
  { type: "beginCharge", title: "进入蓄力", domain: "skill", params: { skillId: "技能", choice: "选择" } },
  { type: "randomStatDebuff", title: "随机属性减益", domain: "stat", params: { target: "目标", layers: "层数", stats: "候选属性" } },
  { type: "grantDedication", title: "获得奉献", domain: "other", params: { target: "目标", key: "类型", value: "数值", count: "次数" } },
  { type: "consumeDedication", title: "消耗奉献", domain: "other", params: { target: "目标", skillId: "技能" } },
  // 其他
  { type: "unsupported", title: "未支持效果", domain: "other", params: { effectType: "原效果类型", reason: "原因" } },
] as const;

const EFFECT_BY_TYPE = new Map(EFFECT_VOCABULARY.map((e) => [e.type, e]));
const TRIGGER_BY_NAME = new Map(TRIGGER_VOCABULARY.map((t) => [t.name, t]));

export function effectVocabularyOf(type: string): EffectVocabulary {
  return EFFECT_BY_TYPE.get(type) ?? { type, title: type, domain: "other" };
}

export function triggerMetaOf(name: string): TriggerMeta {
  return TRIGGER_BY_NAME.get(name) ?? { name, title: name, phase: "other" };
}

// ---------------------------------------------------------------- 条件 / 动态取值

export const CONDITION_OP_LABELS: Record<string, string> = {
  eq: "等于",
  neq: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  in: "属于",
  has: "持有",
  contains: "包含",
};

export const CONDITION_COMBINATOR_LABELS: Record<string, string> = {
  allOf: "全部满足",
  anyOf: "任一满足",
  not: "取反",
};

export const DYNAMIC_VALUE_LABELS: Record<string, string> = {
  path: "取值路径",
  scale: "系数",
  offset: "偏移",
  round: "取整",
  terms: "多项式",
  count: "图鉴计数",
  countKeys: "键计数",
};

export const EFFECT_DOMAIN_LABELS: Record<EffectDomain, string> = {
  damage: "伤害",
  heal: "治疗",
  stat: "强化",
  status: "状态",
  mark: "印记",
  cost: "能耗",
  cooldown: "冷却",
  energy: "能量",
  magic: "魔力",
  action: "行动",
  skill: "技能栏",
  counter: "记忆",
  rule: "规则",
  weather: "天气",
  schedule: "调度",
  other: "其他",
};

/** 工作台 schema 端点返回的整体形状（UI 只认它，不硬编码词汇）。 */
export function schemaPayload() {
  return {
    triggers: TRIGGER_VOCABULARY,
    effects: EFFECT_VOCABULARY,
    conditionOps: CONDITION_OP_LABELS,
    conditionCombinators: CONDITION_COMBINATOR_LABELS,
    dynamicValue: DYNAMIC_VALUE_LABELS,
    domains: EFFECT_DOMAIN_LABELS,
  };
}
