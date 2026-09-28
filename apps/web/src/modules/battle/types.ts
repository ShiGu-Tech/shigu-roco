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
  training?: Partial<Record<"hp" | "atk" | "defense", number>>;
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
  icon?: string | null;
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
  marks: { id: string; name: string; maxStack: number }[];
  weather: { id: string; name: string }[];
  rules: Record<string, unknown>;
  stats?: {
    natures?: CatalogNature[];
    training?: Record<string, unknown>;
    trainingProfiles?: { options?: { id: string; label?: string }[] };
  };
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
