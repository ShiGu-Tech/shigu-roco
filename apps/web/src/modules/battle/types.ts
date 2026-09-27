export type ActionKind = "skill" | "defend" | "switch" | "wish" | "leader";

export interface ActiveSpriteState {
  spriteId: string;
  hp: number;
  maxHp: number;
  energy: number;
  buffs: Record<string, number>;
  debuffs: Record<string, number>;
  marks: Record<string, number>;
  statuses: Record<string, number>;
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
  color?: string;
}

export interface CatalogSkill {
  id: string;
  name: string;
  element: string;
  category: string;
  actionType: string;
  power: number;
  cost: number;
  priority: number;
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
  skills: CatalogSkill[];
}

export interface Catalog {
  dataVersion: string;
  dataUpdatedAt: string;
  elements: CatalogElement[];
  sprites: CatalogSprite[];
  marks: { id: string; name: string; maxStack: number }[];
  weather: { id: string; name: string }[];
  rules: Record<string, unknown>;
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
