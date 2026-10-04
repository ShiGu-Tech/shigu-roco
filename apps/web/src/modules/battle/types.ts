import type { CostMod, StatProfile, StatsData } from "@/modules/engine/types";

export type ActionKind = "skill" | "defend" | "switch" | "wish" | "leader" | "energy";

export interface EngineAction {
  kind: ActionKind;
  skillId?: string;
  benchId?: string;
  label?: string;
  /** 选择技（明 / 暗）：0 = 明，1 = 暗；省略等价 0。 */
  choice?: 0 | 1;
  /** 蓄力域 · 本行动是否为「蓄力后自动释放」。 */
  released?: boolean;
}

/** 养成档案：等级 / 性格 / 个体值（天分 × 星级系数）/ 星级，与引擎口径一致。 */
export type StatProfileState = StatProfile;

export interface ActiveSpriteState {
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
  profile?: StatProfileState;
  skillOverrides?: Record<string, { original: string; expires: number }>;
  /** 记忆域 · 技能持久修正（威力 / 能耗 / 连击 / 先手）。 */
  skillMods?: Record<string, { power?: number; cost?: number; hits?: number; priority?: number }>;
  /** 能耗域 · 声明式能耗修正条目（与引擎 `costMods` 同构）。 */
  costMods?: CostMod[];
}

export interface SideState {
  magic: number;
  active: ActiveSpriteState;
  bench: ActiveSpriteState[];
  seenEnemy: string[];
  wishChargesLeft: number;
  wishCooldown: number;
  leaderUsed: boolean;
}

export interface BattleState {
  turn: number;
  player: SideState;
  enemy: SideState;
  weather: { id: string; turnsLeft: number } | null;
  seed: number;
}

export interface CatalogElement {
  id: number;
  name: string;
  nameZh?: string;
  nameFullZh?: string;
  color?: string;
  icon?: string | null;
}

export interface CatalogSkill {
  id: string;
  name: string;
  nameZh?: string;
  element: string;
  elementZh?: string;
  category: string;
  categoryZh?: string;
  actionType: string;
  actionTypeZh?: string;
  power: number;
  cost: number;
  priority: number;
  icon?: string | null;
  /** 类别图标（物理 / 魔法 / 防御 / 状态）。 */
  categoryIcon?: string | null;
  description?: string;
}

/** 血脉定义（图鉴 meta.bloodlines）：battleTypeId 对应属性 id，icon 为血脉图标。 */
export interface CatalogBloodline {
  id: number;
  key: string;
  name: string;
  short?: string;
  battleTypeId?: number;
  icon?: string | null;
}

export interface CatalogSprite {
  id: string;
  no: number;
  name: string;
  nameZh?: string;
  /** 形态名（如「高山地的样子」），无形态为 null。 */
  form?: string | null;
  /** 形态序号；同一 no 下唯一。 */
  formId?: number;
  stage: number;
  elements: string[];
  race: Record<string, number>;
  trait: { name?: string; desc?: string };
  /** 技能 id → 学习来源：level（升级）/ machine（技能石）/ blood（血脉）。 */
  skillSources?: Record<string, string>;
  leaderAllowed: boolean;
  image?: string | null;
  head?: string | null;
  skills: CatalogSkill[];
}

export interface CatalogNature {
  id: string;
  name?: string;
  nameZh?: string;
  up?: string | null;
  down?: string | null;
  upFactor?: number;
  downFactor?: number;
}

export interface Catalog {
  dataVersion: string;
  dataUpdatedAt: string;
  elements: CatalogElement[];
  /** 18 系别血脉（含图标）。 */
  bloodlines?: CatalogBloodline[];
  sprites: CatalogSprite[];
  allSkills: CatalogSkill[];
  statuses: { id: string; name: string; nameZh?: string; description?: string; maxStack: number }[];
  marks: { id: string; name: string; nameZh?: string; description?: string; maxStack: number }[];
  weather: { id: string; name: string; nameZh?: string; description?: string }[];
  rules: Record<string, unknown>;
  stats?: StatsData;
  warnings: string[];
}

export interface RecommendAction {
  action: { kind: string; skillId?: string; benchId?: string };
  label: string;
  winRate: number;
  visits: number;
  score: number;
}

export interface RecommendResult {
  actions: RecommendAction[];
  opponent: { A: number; D: number; S: number };
  meta: {
    iterations: number;
    elapsedMs: number;
    searchedTurns: number;
    seed: number;
  };
}

export interface BattleEvent {
  type: string;
  side: string;
  text: string;
  data: Record<string, unknown>;
}

export interface Terminal {
  ended: boolean;
  winner: "player" | "enemy" | null;
  reason: string;
}

export interface SimulateTurnResult {
  state: BattleState;
  log: BattleEvent[];
  phaseLogs: string[];
  terminal: Terminal;
}
