import type { Dict } from "../types";

export interface ExternalMeta {
  locale?: string;
  catalogVersion: string;
  generatedAt: string;
  origin?: string;
  counts?: Record<string, number>;
  types?: Array<{
    id: number;
    name: string;
    short?: string;
    color?: string;
    immunities?: string[];
    icon?: string;
    iconOnline?: string;
  }>;
  /** 血脉定义（首领化 / 各系别血脉），含图标。 */
  bloodlines?: Array<{
    id: number;
    key: string;
    name: string;
    short?: string;
    battleTypeId?: number;
    icon?: string | null;
  }>;
}

export interface ExternalSpirit {
  id: number;
  formId: number;
  name: string;
  form?: string | null;
  petbaseId?: number;
  types: number[];
  stage?: number;
  stats: {
    hp: number;
    atk?: number;
    patk?: number;
    defense?: number;
    pdef?: number;
    spatk?: number;
    satk?: number;
    spdef?: number;
    sdef?: number;
    speed?: number;
    spd?: number;
  };
  bst?: number;
  passive?: { name?: string; desc?: string; descPlain?: string } | null;
  img?: string;
  imgOnline?: string;
  imageOnline?: string;
  head?: string;
  headOnline?: string;
  portrait?: string;
  portraitOnline?: string;
  source?: string;
  url?: string;
}

export interface ExternalSkill {
  id: number;
  /** 现行字段（scripts/sync-roco-world.mjs 产出）。 */
  skillName?: string;
  nameZh?: string;
  element?: string;
  elementZh?: string;
  category?: string;
  categoryZh?: string;
  actionType?: string;
  actionTypeZh?: string;
  power?: number;
  powerMin?: number;
  powerMax?: number;
  cost?: number;
  cooldown?: number;
  hitRate?: number;
  priority?: number;
  rawText?: string;
  description?: string;
  icon?: string | null;
  /** 技能类别图标（物理 / 魔法 / 防御 / 状态）。 */
  categoryIcon?: string | null;
  source?: string;
  sourceData?: unknown;
  /** 兼容旧快照字段。 */
  name?: string;
  cat?: string;
  type?: string;
  typeId?: number;
  energy?: number;
  dmgMin?: number;
  dmgMax?: number;
  cdMin?: number;
  cdMax?: number;
  uses?: number;
  n?: number;
  desc?: string;
  descPlain?: string;
  img?: string;
  imgOnline?: string;
}

export interface ExternalLearnedSkill {
  id: number;
  src?: string;
  ord?: number;
  lv?: number | null;
}

export interface ExternalSnapshot {
  meta: ExternalMeta;
  spirits: ExternalSpirit[];
  skills: ExternalSkill[];
  spiritSkills: Record<string, ExternalLearnedSkill[]>;
  skillLearners?: Record<string, unknown>;
  matchups?: unknown;
  glossary?: Array<{ id: number; name: string; desc?: string; descPlain?: string; skills?: string[]; n?: number }>;
  teams?: unknown;
}

export interface RegisteredCatalog {
  registrationId: string;
  source: "roco-world";
  catalogVersion: string;
  generatedAt: string;
  registeredAt: string;
  counts: Record<string, number>;
  warnings: string[];
  sourceMeta: ExternalMeta;
  sprites: Dict[];
  skills: Dict[];
  skillLearners: Record<string, ExternalLearnedSkill[]>;
  glossary: Array<{ id: number; name: string; desc?: string; descPlain?: string; skills?: string[]; n?: number }>;
  weather: Dict[];
  marks: Dict[];
  elements: Dict;
}

export interface RegistryIndex {
  activeRegistrationId: string | null;
  registrations: Array<Pick<RegisteredCatalog, "registrationId" | "catalogVersion" | "generatedAt" | "registeredAt" | "counts" | "warnings">>;
}
