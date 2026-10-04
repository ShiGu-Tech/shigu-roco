/** 引擎领域模型与数据层类型。
 *
 * 约定：运行时对象字段一律 camelCase（与 API 契约一致，序列化即 JSON.stringify）；
 * 游戏数据（data/*.json）保持原始结构，用宽松 Dict 访问。
 */

export type Side = "player" | "enemy";
export type ActionKind = "skill" | "defend" | "switch" | "wish" | "leader" | "energy";

/** 宽松 JSON 对象（游戏数据条目）。 */
export type Dict = Record<string, unknown>;

// ---------------------------------------------------------------- 养成档案

export interface StatProfile {
  level?: number;
  nature?: string | null;
  /** 个体值（天分 × 星级系数），按 stat key（hp/atk/spatk/defense/spdef/speed），各 0~60。 */
  iv?: Record<string, number>;
  /** 星级 0~5（>=1 时性格正向系数随之抬高：1.10 + 0.02×星级）。 */
  stars?: number;
  /** 血脉（培养资质的一部分）：血脉 key（如 COMMON / LEADER / GRASS…），可替换。 */
  bloodline?: string;
}

// ---------------------------------------------------------------- 运行时模型

export interface ActiveSprite {
  spriteId: string;
  hp: number;
  maxHp: number;
  energy: number;
  loadout: string[];
  buffs: Record<string, number>;
  debuffs: Record<string, number>;
  marks: Record<string, number>;
  statuses: Record<string, number>;
  cooldowns?: Record<string, number>;
  faintHandled?: boolean;
  profile?: StatProfile;
  /** 技能池临时改动的还原记录（机制扩展）：临时技能 id → { original, expires }。
   *  original 为空 = 临时新增（到期移除）；expires 为绝对回合（-1 永久、0 表示使用后即还原）。 */
  skillOverrides?: Record<string, { original: string; expires: number; cost?: number }>;
  /** 蓄力域 · 已蓄力、下回合自动释放的技能（占用该侧行动）。 */
  pendingSkill?: { skillId: string; choice?: 0 | 1 };
  /** 入场域 · 本次入场后是否已行动过（供「迸发：入场首次行动」类条件）。 */
  actedSinceEntry?: boolean;
  /** 入场域 · 本回合结算后被「返场」标记（回合末重置 `actedSinceEntry` 并触发 onEntry，由模拟器处理）。 */
  returnedThisTurn?: boolean;
  /** 记忆域 · 计数器：任意 key → 值（如每使用/累计类）。 */
  counters?: Record<string, number>;
  /** 记忆域 · 技能永久修正：skillId → 威力 / 能耗 / 连击 / 先手的持久 delta。 */
  skillMods?: Record<string, { power?: number; cost?: number; hits?: number; priority?: number }>;
  /** 能耗域 · 声明式能耗修正条目（读时求和，见 `effectiveCost`）。 */
  costMods?: CostMod[];
  /** 入场域 · 本局是否已入场过（供「首次入场」类机制判断 `event.first`）。 */
  entered?: boolean;
  /** 图鉴域 · 系别（运行时从图鉴注入，供「非本系」「携带系别」类条件）。 */
  element?: string[];
  /** 图鉴域 · 携带技能的系别集合（开局注入，供「受到自己携带技能系别」类条件）。 */
  carryElements?: string[];
  /** 血脉域 · 当前血脉 key（培养资质，来自 `profile.bloodline` ?? 图鉴首选项）。 */
  bloodline?: string;
  /** 血脉域 · 血脉对应的系别名（系别血脉；首领等无系别为 ""）。 */
  bloodlineElement?: string;
}

/** 能耗修正条目：挂在精灵身上、由技能 / 特性 / 状态登记，读时按作用域求和。 */
export interface CostMod {
  /** 唯一键；同 key 覆盖（去重、驱散定位、`mode:"set"` 每回合重算）。 */
  key: string;
  /** 来源类别（引擎只存字符串，具体 id 在 sourceId）。 */
  source: "skill" | "trait" | "status" | "system";
  sourceId?: string;
  /** 来源侧 / 来源在场精灵（供 aura 在来源离场时回收）。 */
  sourceSide?: Side;
  sourceSpriteId?: string;
  scope: "skill" | "attack" | "defense" | "all";
  skillId?: string;
  /** 技能栏域 · 仅当技能位于这些槽位（1-based）时生效（「位于 1/3 号位能耗 −2」）。 */
  slots?: number[];
  elements?: string[];
  excludeElements?: string[];
  delta?: number;
  multiply?: number;
  /** add（默认，累加/相乘）| set（用 delta 覆盖基础值，每回合重算）。 */
  mode?: "add" | "set";
  duration: "permanent" | "turns" | "nextAction" | "aura";
  turnsLeft?: number;
  oncePerTurn?: boolean;
  /** 名义 debuff（技能造成）可驱散；特性造成的不可。 */
  dispellable: boolean;
  /** 隐藏（天洪：只改数字、不显示来源）；特性 / 状态可见。 */
  hidden: boolean;
}

/** 记忆域 · 上回合记忆（供「若上回合…」类条件）。 */
export interface LastTurn {
  skillId?: string;
  category?: string;
  actionType?: string;
  element?: string;
  reacted?: boolean;
  switched?: boolean;
  /** 本回合实际消耗的技能能耗（供「按双方能耗」类条件）。 */
  cost?: number;
}

export interface SideState {
  magic: number;
  active: ActiveSprite;
  bench: ActiveSprite[];
  teamMarks: Record<string, number>;
  switchLock: number;
  seenEnemy: string[];
  wishChargesLeft: number;
  wishCooldown: number;
  leaderUsed: boolean;
  /** 记忆域 · 队伍计数器。 */
  counters?: Record<string, number>;
  /** 记忆域 · 上回合本队动作。 */
  lastTurn?: LastTurn;
  /** 行动域 · 本队被强制换人（引擎标记，前端须补一次 forced-switch）。 */
  forcedSwitch?: boolean;
  /** 行动域 · 下个入场精灵待执行的继承 / 附加效果队列。 */
  pendingEntry?: import("./mechanisms/types").EffectSpec[];
  /** 延迟域 · 跨回合调度待执行的效果（`scheduleEffect`）。 */
  pendingEffects?: import("./mechanisms/types").PendingEffect[];
  /** 本回合是否更换过精灵（每回合开始清空）。 */
  switchedThisTurn?: boolean;
  /** 最近一次对本侧造成伤害的来源（供阵亡归属）。 */
  lastHit?: { side: Side; skillId?: string };
  /** 奉献域 · 队伍待生效的奉献（作用于带「受奉献影响」tag 的技能，每次使用消耗一个）。 */
  dedications?: { key: "power" | "combo" | "cost" | "lifesteal"; value: number }[];
}

export interface Weather {
  id: string;
  turnsLeft: number;
}

export interface BattleState {
  turn: number;
  player: SideState;
  enemy: SideState;
  weather: Weather | null;
  seed: number;
  /** 本回合已触发过的 `oncePerTurn` 机制（`side:mechanismId`），回合开始清空。 */
  onceFired?: Record<string, boolean>;
}

export interface Action {
  kind: ActionKind;
  skillId?: string;
  benchId?: string;
  label?: string;
  /** 选择技（明 / 暗）：0 = 明，1 = 暗；省略等价 0。 */
  choice?: 0 | 1;
  /** 蓄力域 · 本行动是否为「蓄力后自动释放」。 */
  released?: boolean;
}

export interface BattleEvent {
  type: string;
  side: Side | null;
  text: string;
  data: Dict;
}

export interface StepResult {
  state: BattleState;
  events: BattleEvent[];
  phaseLogs: string[];
}

export interface Terminal {
  ended: boolean;
  winner: Side | null;
  reason: string;
}

// ---------------------------------------------------------------- 养成数据

export interface NatureDef {
  id: string;
  name?: string;
  nameZh?: string;
  up?: string | null;
  down?: string | null;
  upFactor?: number;
  downFactor?: number;
}

/** 面板系数：panel(L) = round( 性格 × round( base + 种族×raceBase + 个体×ivBase + (levelBase + 种族×raceSlope + 个体×ivSlope)×L ) )。 */
export interface StatsPanelDef {
  base: number;
  raceBase: number;
  ivBase: number;
  levelBase: number;
  raceSlope: number;
  ivSlope: number;
}

export interface IndividualDef {
  starMultiplier?: number;
  maxPerStat?: number;
  starMax?: number;
  investCount?: number;
}

export interface TrainingProfileDef {
  id: string;
  label?: string;
  prior?: number;
  nature?: string | null;
  iv?: Record<string, number>;
}

export interface StatsData {
  level?: { default?: number };
  panels?: { hp?: StatsPanelDef; default?: StatsPanelDef };
  natureScaling?: { upBase?: number; upPerStar?: number; downFactor?: number; starMax?: number };
  starBonus?: { hp?: number; default?: number; starMax?: number };
  individual?: IndividualDef;
  natures?: NatureDef[];
  trainingProfiles?: { options?: TrainingProfileDef[]; sigma?: number };
  /** 加点自动推荐（机械 v1）阈值；缺省用代码内置默认。 */
  talentRecommend?: { speedThreshold?: number; hpThreshold?: number; attackThreshold?: number };
}

// ---------------------------------------------------------------- 数据层

export interface DataBundle {
  sprites: Record<string, Dict>;
  skills: Record<string, Dict>;
  /** Buff / 状态（中毒、灼烧…）。 */
  statuses: Record<string, Dict>;
  marks: Record<string, Dict>;
  weather: Record<string, Dict>;
  elements: Dict;
  rules: Dict;
  stats: StatsData;
  assets: Dict;
  /** 可选机制扩展定义；缺失时使用空注册表。 */
  mechanisms?: unknown[];
  warnings: string[];
  dataVersion: string;
  dataUpdatedAt: string;
}

export interface RawDataFiles {
  sprites: Dict;
  skills: Dict;
  statuses?: Dict;
  marks: Dict;
  weather: Dict;
  elements: Dict;
  rules: Dict;
  stats?: Dict;
  assets?: Dict;
  mechanisms?: unknown;
}

// ---------------------------------------------------------------- 工具

export function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function toStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function toArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function asDict(v: unknown): Dict {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {};
}

export function sideOf(state: BattleState, who: Side): SideState {
  return who === "player" ? state.player : state.enemy;
}

export const OTHER_SIDE: Record<Side, Side> = { player: "enemy", enemy: "player" };
