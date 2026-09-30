/** 精灵实例：图鉴模板的个性化副本（一等领域对象）。
 *
 * 只存「选择 + 养成」——`spriteId` 外键引用图鉴模板，`level / stars / nature / talent / skills`
 * 是玩家的选择。面板、个体值、技能数值等一切可由模板 + 档案派生的值一律**现算不落盘**，
 * 因此图鉴换版（种族值 / 技能 / 名称调整）后实例自动跟着变。
 *
 * 本模块为纯逻辑（不依赖 fs / DOM），前端与引擎共用；`resolveInstance` 是唯一物化入口。
 */

import { STAT_KEYS, type StatKey } from "../engine/stats";
import type { StatProfile } from "../engine/types";
import type { Catalog, CatalogSprite, CatalogSkill } from "../battle/types";

/** 天分表：各属性 1~10（未填 = 未加点）。 */
export type TalentMap = Partial<Record<StatKey, number>>;

/** 精灵实例：`id` 稳定、跨模板版本不变；模板数据一律经 `spriteId` 现查。 */
export interface PetInstance {
  id: string;
  /** 实例名称（用户取名，可空）。 */
  name?: string;
  /** 外键 → 图鉴模板（`Catalog.sprites[].id` / `DataBundle.sprites[spriteId]`）。 */
  spriteId: string;
  level: number;
  /** 星级 0~5。 */
  stars: number;
  /** 性格 id（↔ `StatsData.natures[].id`）；null = 中性。 */
  nature: string | null;
  talent: TalentMap;
  /** 出战技能 id（外键 → 模板技能池），≤ 4；空 = 用模板默认 4 招。 */
  skills: string[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_LEVEL = 60;
export const DEFAULT_STARS = 5;
/** 出战技能槽上限。 */
export const MAX_SKILLS = 4;
/** 加点项数兜底上限（权威值优先取 `stats.individual.investCount`）。 */
export const DEFAULT_MAX_INVEST = 3;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 空白实例（id 为空，保存时再分配）。 */
export function emptyInstance(spriteId: string, now = Date.now()): PetInstance {
  return {
    id: "",
    spriteId,
    level: DEFAULT_LEVEL,
    stars: DEFAULT_STARS,
    nature: null,
    talent: {},
    skills: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 新建实例（带稳定 id）。 */
export function newInstance(spriteId: string, now = Date.now()): PetInstance {
  return { ...emptyInstance(spriteId, now), id: randomId() };
}

/** 实例 ⇄ 养成配置（对战台 / 弹窗编辑用）。 */
export interface PetSetupLike {
  level: number;
  stars: number;
  nature: string | null;
  talent: TalentMap;
  skills: string[];
}

/** 养成配置 → 新实例（补发 id）。 */
export function instanceFromSetup(spriteId: string, setup: PetSetupLike, now = Date.now()): PetInstance {
  return {
    ...newInstance(spriteId, now),
    level: setup.level,
    stars: setup.stars,
    nature: setup.nature,
    talent: { ...setup.talent },
    skills: [...setup.skills],
  };
}

/** 实例 → 养成配置（拷贝，避免共享引用）。 */
export function setupFromInstance(instance: PetInstance): PetSetupLike {
  return {
    level: instance.level,
    stars: instance.stars,
    nature: instance.nature,
    talent: { ...instance.talent },
    skills: [...instance.skills],
  };
}

/** 实例 → 引擎档案：个体值 = 天分 ×(1 + 星级)，与《数值与伤害模型》口径一致。 */
export function profileFromInstance(instance: Pick<PetInstance, "level" | "stars" | "nature" | "talent">): StatProfile {
  const stars = Math.max(0, Math.floor(instance.stars));
  const iv: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    const talent = instance.talent[key];
    if (talent != null) iv[key] = Math.round(talent * (1 + stars));
  }
  return { level: instance.level, stars, nature: instance.nature ?? null, iv };
}

export type InstanceIssue =
  | { kind: "orphan-sprite"; spriteId: string }
  | { kind: "unknown-skill"; skillId: string }
  | { kind: "skill-not-learnable"; skillId: string }
  | { kind: "too-many-talents"; count: number; max: number }
  | { kind: "too-many-skills"; count: number };

export interface ResolvedInstance {
  instance: PetInstance;
  /** 模板；null = orphan（模板已不存在）。 */
  sprite: CatalogSprite | null;
  profile: StatProfile;
  /** 过滤出合法技能后的出战列表（保持原顺序、去重、≤4）；空 = 用模板默认 4 招。 */
  loadout: string[];
  issues: InstanceIssue[];
}

function skillCatalog(catalog: Catalog): Set<string> {
  const ids = new Set<string>();
  for (const skill of catalog.allSkills ?? []) ids.add(skill.id);
  for (const sprite of catalog.sprites) for (const skill of sprite.skills) ids.add(skill.id);
  return ids;
}

/** 把实例物化成引擎需要的 `profile + loadout`，并登记失效引用（不删除实例、只标记）。 */
export function resolveInstance(catalog: Catalog, instance: PetInstance): ResolvedInstance {
  const sprite = catalog.sprites.find((s) => s.id === instance.spriteId) ?? null;
  const issues: InstanceIssue[] = [];
  if (!sprite) issues.push({ kind: "orphan-sprite", spriteId: instance.spriteId });

  const known = skillCatalog(catalog);
  const learnable = new Set(sprite?.skills.map((s) => s.id) ?? []);
  const loadout: string[] = [];
  const seen = new Set<string>();
  for (const skillId of instance.skills) {
    if (!skillId || seen.has(skillId)) continue;
    if (!known.has(skillId)) {
      issues.push({ kind: "unknown-skill", skillId });
      continue;
    }
    if (sprite && !learnable.has(skillId)) {
      issues.push({ kind: "skill-not-learnable", skillId });
      continue;
    }
    seen.add(skillId);
    if (loadout.length < MAX_SKILLS) loadout.push(skillId);
  }
  if (instance.skills.length > MAX_SKILLS) issues.push({ kind: "too-many-skills", count: instance.skills.length });

  const maxInvest = catalog.stats?.individual?.investCount ?? DEFAULT_MAX_INVEST;
  const invested = STAT_KEYS.filter((key) => instance.talent[key] != null).length;
  if (invested > maxInvest) issues.push({ kind: "too-many-talents", count: invested, max: maxInvest });

  return { instance, sprite, profile: profileFromInstance(instance), loadout, issues };
}

/** 便捷：实例的出战技能（已过滤）。 */
export function loadoutOf(resolved: ResolvedInstance): string[] {
  return resolved.loadout;
}

/** 便捷：技能 id → 展示用技能定义（全库现查）。 */
export function skillOf(catalog: Catalog, skillId: string): CatalogSkill | undefined {
  return (catalog.allSkills ?? []).find((s) => s.id === skillId);
}
