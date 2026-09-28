import type { StatsData } from "@/modules/engine/types";

export type ActionKind = "skill" | "defend" | "switch" | "wish" | "leader" | "energy";

export interface EngineAction {
  kind: ActionKind;
  skillId?: string;
  benchId?: string;
  label?: string;
}

export interface StatProfileState {
  level?: number;
  nature?: string | null;
  /** 个体值（天分 × 星级系数）：hp/atk/spatk/defense/spdef/speed，各 0~60。 */
  iv?: Record<string, number>;
}

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
  profile?: StatProfileState;
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
  description?: string;
}

export interface CatalogSprite {
  id: string;
  no: number;
  name: string;
  nameZh?: string;
  stage: number;
  elements: string[];
  race: Record<string, number>;
  trait: { name?: string; desc?: string };
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
  sprites: CatalogSprite[];
  allSkills: CatalogSkill[];
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
