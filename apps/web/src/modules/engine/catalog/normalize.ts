import type { Dict } from "../types";
import type { ExternalSnapshot, RegisteredCatalog } from "./types";

const CATEGORY: Record<string, string> = { 物理: "Physical", 魔法: "Magic", 状态: "Status", 防御: "Defense" };
const ELEMENT: Record<string, string> = {
  普通系: "Normal", 草系: "Grass", 火系: "Fire", 水系: "Water", 光系: "Light", 地系: "Earth", 冰系: "Ice", 龙系: "Dragon",
  电系: "Electric", 毒系: "Poison", 虫系: "Insect", 恶魔系: "Dark", 机械系: "Mechanic", 萌系: "Cute", 武系: "Fighting", 幽灵系: "Ghost", 石系: "Rock", 翼系: "Wing",
};
const CATEGORY_ZH: Record<string, string> = { 物理: "物理", 魔法: "魔法", 状态: "状态", 防御: "防御" };

function elementName(name: string, meta: ExternalSnapshot["meta"]): string {
  name = typeof name === "string" ? name : "未知属性";
  if (ELEMENT[name]) return ELEMENT[name];
  const found = meta.types?.find((type) => type.name === name || type.short === name);
  return found ? ELEMENT[found.name] ?? found.name : name.replace(/系$/, "");
}

function skillCategory(value: string | undefined): string {
  if (!value) return "";
  return CATEGORY[value] ?? value;
}

function skillId(value: string | number): string {
  const id = String(value);
  return id.startsWith("sk-") ? id : `sk-${id}`;
}

/** 站点描述里的内联引用标签（如 `<desc_id=1015>应对状态</>`）只保留可见文本。 */
function plainText(value: unknown): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "") : "";
}

/** 从站点描述内联标签推导技能的通用「应对」属性（1015 应对状态 / 1016 应对攻击 / 1017 应对防御）。
 *  这是数据摄取层的职责：引擎只读 `skill.reaction`，不认识站点标签格式。 */
const REACTION_TAG: Record<string, string> = { "1015": "Status", "1016": "Attack", "1017": "Defense" };
function skillReaction(value: unknown): string | null {
  const match = typeof value === "string" ? value.match(/<desc_id=(1015|1016|1017)>/) : null;
  return match ? REACTION_TAG[match[1]] : null;
}

export function normalizeSnapshot(snapshot: ExternalSnapshot, registrationId: string, registeredAt: string): RegisteredCatalog {
  const warnings: string[] = [];
  const skillIds = new Set(snapshot.skills.map((skill) => String(skill.id).startsWith("sk-") ? String(skill.id) : `sk-${skill.id}`));
  const sprites: Dict[] = snapshot.spirits.map((spirit) => {
    const key = `${spirit.id}:${spirit.formId}`;
    const learned = snapshot.spiritSkills[key] ?? [];
    const skillList = learned.filter((entry) => entry.src !== "passive").map((entry) => skillId(entry.id));
    const skillSources: Dict = {};
    for (const entry of learned) {
      const src = entry.src;
      if (typeof src === "string" && src !== "passive") skillSources[skillId(entry.id)] = src;
    }
    for (const skillId of skillList) if (!skillIds.has(skillId)) warnings.push(`精灵 ${key} 引用了未知技能 ${skillId}`);
    return {
      id: `sp-${spirit.id}-${spirit.formId}`,
      no: spirit.id,
      formId: spirit.formId,
      name: spirit.form ? `${spirit.name}（${spirit.form}）` : spirit.name,
      nameZh: spirit.name,
      form: spirit.form ?? null,
      stage: spirit.stage ?? 1,
      elements: spirit.types.map((id) => elementName(snapshot.meta.types?.find((type) => type.id === id)?.name ?? String(id), snapshot.meta)),
      race: {
        hp: spirit.stats.hp,
        atk: spirit.stats.atk ?? spirit.stats.patk,
        defense: spirit.stats.defense ?? spirit.stats.pdef,
        spatk: spirit.stats.spatk ?? spirit.stats.satk,
        spdef: spirit.stats.spdef ?? spirit.stats.sdef,
        speed: spirit.stats.speed ?? spirit.stats.spd,
      },
      trait: spirit.passive ? { name: spirit.passive.name ?? "", desc: plainText(spirit.passive.descPlain ?? spirit.passive.desc), params: { unsupported: true } } : { name: "", desc: "", params: {} },
      skillList,
      /** 每个技能的学习来源：level（升级）/ machine（技能石）/ blood（血脉）。 */
      skillSources,
      leaderAllowed: true,
      image: spirit.portraitOnline ?? spirit.imageOnline ?? spirit.imgOnline ?? null,
      head: spirit.headOnline ?? spirit.head ?? null,
      source: spirit.url ?? snapshot.meta.origin ?? "",
      sourceData: spirit,
    };
  });
  const skills: Dict[] = snapshot.skills.map((skill) => ({
    id: skillId(skill.id),
    skillName: skill.name ?? skill.skillName,
    nameZh: skill.nameZh ?? skill.name ?? skill.skillName,
    element: elementName(skill.type ?? skill.element ?? "", snapshot.meta),
    elementZh: (skill.elementZh ?? skill.type ?? skill.element ?? "未知属性").replace(/系$/, ""),
    category: skill.category ?? skillCategory(skill.cat),
    categoryZh: skill.categoryZh ?? CATEGORY_ZH[skill.cat ?? ""] ?? skill.category ?? skill.cat,
    actionType: skill.actionType ?? (skillCategory(skill.cat) === "Defense" ? "Defense" : skillCategory(skill.cat) === "Status" ? "Status" : "Attack"),
    actionTypeZh: skill.actionTypeZh ?? (skill.cat === "防御" ? "防御" : skill.cat === "状态" ? "状态" : "攻击"),
    power: skill.power ?? skill.dmgMax ?? skill.dmgMin ?? 0,
    powerMin: skill.powerMin ?? skill.dmgMin,
    powerMax: skill.powerMax ?? skill.dmgMax,
    cost: skill.cost ?? skill.energy ?? 0,
    cooldown: skill.cooldown ?? skill.cdMax ?? skill.cdMin ?? 0,
    hitRate: 100,
    priority: 0,
    rawText: plainText(skill.description ?? skill.descPlain ?? skill.desc),
    description: plainText(skill.description ?? skill.descPlain ?? skill.desc),
    /** 通用「应对」属性（数据层推导，引擎只读）。 */
    reaction: skillReaction(skill.description ?? skill.descPlain ?? skill.desc),
    icon: skill.icon ?? skill.imgOnline ?? null,
    categoryIcon: skill.categoryIcon ?? null,
    source: skill.source ?? snapshot.meta.origin ?? "",
    sourceData: skill,
  }));
  const types = (snapshot.meta.types ?? []).map((type) => ({ id: type.id, name: elementName(type.name, snapshot.meta), nameZh: type.short ?? (typeof type.name === "string" ? type.name.replace(/系$/, "") : "未知"), nameFullZh: type.name, color: type.color ?? "", icon: type.iconOnline ?? null, statusImmunities: type.immunities ?? [] }));
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const matrix: Record<string, Record<string, string>> = {};
  for (const row of Array.isArray(snapshot.matchups) ? snapshot.matchups as number[][] : []) {
    const [attackId, defendId, relation] = row;
    const attack = typeNames.get(attackId);
    const defend = typeNames.get(defendId);
    if (!attack || !defend) continue;
    matrix[attack] ??= {};
    matrix[attack][defend] = relation > 0 ? "counter" : relation < 0 ? "resisted" : "neutral";
  }
  const glossaryById = new Map((snapshot.glossary ?? []).map((entry) => [entry.id, entry]));
  // 三类互斥：状态（buff，换人默认清除）/ 印记（下场继承、正负各 1）/ 天气。key 取自站点 icon_key。
  const STATUS_KEYS: Record<number, string> = {
    1001: "poison", 1002: "burn", 1004: "freeze", 1006: "moe", 1008: "parasite",
    3022: "conductive-charge", 3023: "rooted", 3024: "wooden-barrel-state", 3025: "moonfall-star-state",
  };
  const MARK_KEYS: Record<number, string> = {
    1014: "poison-mark", 1018: "attack-mark", 1019: "thorn-mark", 1021: "photosynthesis-mark",
    1022: "wet-mark", 1023: "electric-charge-mark", 1027: "wind-mark", 1028: "spirit-mark",
    1030: "momentum-mark", 1031: "dragon-devour-mark", 1032: "slow-mark", 1035: "starfall-mark",
    3012: "sprout-mark", 3020: "undertow-mark",
  };
  const WEATHER_KEYS: Record<number, string> = { 3006: "sandstorm", 3007: "blizzard", 3008: "rain", 3021: "thunder" };
  const fromGlossary = (keys: Record<number, string>, maxStack?: number): Dict[] =>
    Object.keys(keys)
      .map(Number)
      .flatMap((id) => {
        const entry = glossaryById.get(id);
        if (!entry) return [];
        return [{ id: keys[id], name: entry.name, nameZh: entry.name, description: plainText(entry.descPlain ?? entry.desc), ...(maxStack ? { maxStack } : {}) }];
      });
  const statuses: Dict[] = fromGlossary(STATUS_KEYS, 10);
  const marks: Dict[] = fromGlossary(MARK_KEYS);
  const weather: Dict[] = fromGlossary(WEATHER_KEYS);
  return {
    registrationId,
    source: "roco-world",
    catalogVersion: snapshot.meta.catalogVersion,
    generatedAt: snapshot.meta.generatedAt,
    registeredAt,
    counts: { spirits: sprites.length, skills: skills.length, spiritSkills: Object.values(snapshot.spiritSkills).reduce((sum, list) => sum + list.length, 0), types: types.length },
    warnings,
    sourceMeta: snapshot.meta,
    sprites,
    skills,
    skillLearners: snapshot.skillLearners as RegisteredCatalog["skillLearners"],
    glossary: (snapshot.glossary ?? []).map((entry) => ({
      ...entry,
      name: plainText(entry.name),
      desc: plainText(entry.desc),
      descPlain: plainText(entry.descPlain),
    })),
    statuses,
    marks,
    weather,
    elements: { $schemaVersion: "0.2", version: snapshot.meta.catalogVersion, updatedAt: snapshot.meta.generatedAt, elements: types, bloodlines: snapshot.meta.bloodlines ?? [], matrix, values: { counter: 2, counter3: 3, neutral: 1, resisted: 0.5, resisted4: 0.25 }, combine: { mode: "count", clampTo: [0.25, 3] } },
  };
}
