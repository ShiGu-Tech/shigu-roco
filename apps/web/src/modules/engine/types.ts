/** 引擎领域模型与数据层类型。
 *
 * 约定：运行时对象字段一律 camelCase（与 API 契约一致，序列化即 JSON.stringify）；
 * 游戏数据（data/*.json）保持原始结构，用宽松 Dict 访问。
 */

export type Side = "player" | "enemy";
export type ActionKind = "skill" | "defend" | "switch" | "wish" | "leader" | "energy";
export type TrainingPanel = "hp" | "atk" | "defense";

/** 宽松 JSON 对象（游戏数据条目）。 */
export type Dict = Record<string, unknown>;

// ---------------------------------------------------------------- 养成档案

export interface StatProfile {
  level?: number;
  nature?: string | null;
  /** 三维面板点数：体力 / 攻击 / 防御。 */
  training?: Partial<Record<TrainingPanel, number>>;
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
  profile?: StatProfile;
}

export interface SideState {
  magic: number;
  active: ActiveSprite;
  bench: ActiveSprite[];
  seenEnemy: string[];
  wishChargesLeft: number;
  wishCooldown: number;
  leaderUsed: boolean;
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
}

export interface Action {
  kind: ActionKind;
  skillId?: string;
  benchId?: string;
  label?: string;
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

export interface TrainingPanelDef {
  stat: string;
  perPoint: number;
  min?: number;
  max?: number;
}

export interface TrainingProfileDef {
  id: string;
  label?: string;
  prior?: number;
  nature?: string | null;
  training?: Partial<Record<TrainingPanel, number>>;
}

export interface StatsData {
  level?: { default?: number };
  natures?: NatureDef[];
  training?: {
    panels?: string[];
    perPanel?: Record<string, TrainingPanelDef>;
  };
  trainingProfiles?: { options?: TrainingProfileDef[] };
}

// ---------------------------------------------------------------- 数据层

export interface DataBundle {
  sprites: Record<string, Dict>;
  skills: Record<string, Dict>;
  marks: Record<string, Dict>;
  weather: Record<string, Dict>;
  elements: Dict;
  rules: Dict;
  stats: StatsData;
  assets: Dict;
  warnings: string[];
  dataVersion: string;
  dataUpdatedAt: string;
}

export interface RawDataFiles {
  sprites: Dict;
  skills: Dict;
  marks: Dict;
  weather: Dict;
  elements: Dict;
  rules: Dict;
  stats?: Dict;
  assets?: Dict;
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
