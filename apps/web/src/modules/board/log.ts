import type { BattleEvent, Catalog } from "@/modules/battle/types";
import { effectVocabularyOf, triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

function sideName(side?: string): string {
  return side === "enemy" ? "敌方" : side === "player" ? "我方" : "";
}

/** 把事件文本里的技能 / 精灵 id 与 side 换成中文。 */
function localizeIds(text: string, catalog: Catalog): string {
  return text
    .replace(/sk-\d+/g, (m) => catalog.allSkills.find((s) => s.id === m)?.name ?? m)
    .replace(/sp-\d+-\d+/g, (m) => catalog.sprites.find((s) => s.id === m)?.name ?? m)
    .replace(/\bplayer\b/g, "我方")
    .replace(/\benemy\b/g, "敌方");
}

/** 把一条战斗事件翻成中文可读句子（引擎机制事件多为英文 type + data，这里统一成中文）。 */
export function describeEvent(e: BattleEvent, catalog: Catalog): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const side = sideName(e.side);
  const n = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
  const statusName = (id: unknown) => catalog.statuses.find((s) => s.id === id)?.nameZh ?? String(id ?? "");
  const markName = (id: unknown) => catalog.marks.find((m) => m.id === id)?.nameZh ?? String(id ?? "");
  const weatherName = (id: unknown) => catalog.weather.find((w) => w.id === id)?.nameZh ?? String(id ?? "");
  const skillName = (id: unknown) => catalog.allSkills.find((s) => s.id === id)?.name ?? String(id ?? "");

  switch (e.type) {
    case "damage": {
      const skill = d.skillId ? `（${skillName(d.skillId)}）` : "";
      return `${side}受到 ${n(d.value)} 点伤害${skill}`;
    }
    case "healed":
      return `${side}回复 ${n(d.value)} 点生命`;
    case "magic-modified":
      return `${side}魔力 ${n(d.before)} → ${n(d.after)}`;
    case "energy-modified":
      return `${side}能量 ${n(d.before)} → ${n(d.after)}`;
    case "switch-lock-modified":
      return `${side}禁足 ${n(d.before)} → ${n(d.after)}`;
    case "mark-immune":
      return `${side}免疫印记「${markName(d.markId)}」`;
    case "mark-applied":
      return `${side}获得印记「${markName(d.markId)}」× ${n(d.after)}`;
    case "mark-removed":
      return `${side}移除印记「${markName(d.markId)}」`;
    case "mark-settled":
      return `${side}印记「${markName(d.markId)}」结算 → ${n(d.after)}`;
    case "status-immune":
      return `${side}免疫状态「${statusName(d.statusId)}」`;
    case "status-applied":
      return `${side}获得状态「${statusName(d.statusId)}」× ${n(d.after)}`;
    case "status-settled":
      return `${side}状态「${statusName(d.statusId)}」结算 → ${n(d.after)}`;
    case "status-set":
      return `${side}状态「${statusName(d.statusId)}」设为 ${n(d.after)}`;
    case "status-scaled":
      return `${side}状态「${statusName(d.statusId)}」${n(d.before)} → ${n(d.after)}`;
    case "status-removed":
      return `${side}状态「${statusName(d.statusId)}」消失`;
    case "weather-changed":
      return `天气变为「${weatherName(d.weatherId)}」`;
    case "cooldown-modified":
      return `${skillName(d.skillId)} 冷却 ${n(d.before)} → ${n(d.after)}`;
    case "action-cancelled":
      return `技能被打断`;
    case "action-priority-changed":
      return `先手顺序变更`;
    case "action-replaced":
      return `技能被替换`;
    case "action-inserted":
      return `插入额外行动`;
    case "mark-consumed":
      return `${side}消耗印记「${markName(d.markId)}」共 ${n(d.total)} 层`;
    case "mark-scaled":
      return `${side}印记「${markName(d.markId)}」${n(d.before)} → ${n(d.after)}`;
    case "mark-set":
      return `${side}印记「${markName(d.markId)}」${n(d.before)} → ${n(d.after)}`;
    case "mark-transferred":
      return `印记「${markName(d.markId)}」转移 ${n(d.moved)} 层`;
    case "mark-transformed":
      return `印记「${markName(d.markId)}」收拢（共 ${n(d.before)}）`;
    case "stat-modified":
      return `${side}${d.stat} ${n(d.before)} → ${n(d.after)}`;
    case "stat-cleared":
      return `${side}被驱散增益`;
    case "skill-modified":
      return `${side}技能「${skillName(d.skillId)}」永久修正`;
    case "skill-cost-modified": {
      const delta = n(d.delta);
      return `${side}能耗修正 ${delta >= 0 ? "+" : ""}${delta}`;
    }
    case "counter-added":
      return `${side}计数器 ${d.key} ${n(d.before)} → ${n(d.after)}`;
    case "counter-set":
      return `${side}计数器 ${d.key} 设为 ${n(d.after)}`;
    case "counter-cleared":
      return `${side}清除计数器 ${d.key ?? "全部"}`;
    case "entry-scheduled":
      return `预约了入场效果（${n(d.count)} 条）`;
    case "transform":
      return `${side}退化 / 形态变化`;
    case "switch":
    case "stat-inherited":
    case "faint":
      return localizeIds(e.text, catalog);
    default: {
      const effectType = typeof d.effectType === "string" ? d.effectType : "";
      if (effectType) {
        const trig = typeof d.trigger === "string" ? `【${triggerMetaOf(d.trigger).title}】` : "";
        return `${trig}机制效果：${effectVocabularyOf(effectType).title}`;
      }
      return localizeIds(e.text || e.type, catalog);
    }
  }
}

/** 有「人类可读叙事」的事件类型（= 上面 switch 有专属分支者）；其余带 `effectType` 的机制事件走胶囊。 */
const NARRATIVE_TYPES = new Set<string>([
  "damage",
  "healed",
  "magic-modified",
  "energy-modified",
  "switch-lock-modified",
  "mark-immune",
  "mark-applied",
  "mark-removed",
  "mark-settled",
  "status-immune",
  "status-applied",
  "status-settled",
  "status-set",
  "status-scaled",
  "status-removed",
  "weather-changed",
  "cooldown-modified",
  "action-cancelled",
  "action-priority-changed",
  "action-replaced",
  "action-inserted",
  "mark-consumed",
  "mark-scaled",
  "mark-set",
  "mark-transferred",
  "mark-transformed",
  "stat-modified",
  "stat-cleared",
  "skill-modified",
  "skill-cost-modified",
  "counter-added",
  "counter-set",
  "counter-cleared",
  "entry-scheduled",
  "switch",
  "stat-inherited",
  "transform",
  "faint",
]);

/** 机制命中（无叙事文本）→ 观战页渲染为「触发 / 机制 / 效果」胶囊；否则返回 null（走文本行）。 */
export function mechanismHitOf(e: BattleEvent): { trigger: string; mechanismId: string; effectType: string } | null {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const effectType = typeof d.effectType === "string" ? d.effectType : "";
  const mechanismId = typeof d.mechanismId === "string" ? d.mechanismId : "";
  if (!effectType || !mechanismId || NARRATIVE_TYPES.has(e.type)) return null;
  return { trigger: typeof d.trigger === "string" ? d.trigger : "", mechanismId, effectType };
}

/** 一条战斗日志行：分类（攻击/防御/状态/特性…）+ 来源名（技能名/特性名）+ 结果文本。 */
export interface LogRow {
  side: "player" | "enemy" | "system";
  /** 攻击 / 防御 / 状态（技能按 `actionTypeZh`）；特性 / 印记 / 状态 / 天气（机制归属）。 */
  kind: string;
  source: string;
  text: string;
  mechanism?: { trigger: string; mechanismId: string; effectType: string };
}

function skillLabel(catalog: Catalog, id: string): { kind: string; name: string } | null {
  const skill = catalog.allSkills.find((s) => s.id === id);
  if (!skill) return null;
  return { kind: skill.actionTypeZh ?? skill.actionType ?? "技能", name: skill.nameZh ?? skill.name };
}

/** 事件来源：优先技能，其次机制归属（特性 / 印记 / 状态 / 天气）。 */
export function sourceOf(e: BattleEvent, catalog: Catalog): { kind: string; name: string } | null {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const skillId = typeof d.skillId === "string" ? d.skillId : "";
  if (skillId) return skillLabel(catalog, skillId);
  const mechanismId = typeof d.mechanismId === "string" ? d.mechanismId : "";
  if (!mechanismId) return null;
  const parts = mechanismId.split(":");
  if (parts[0] === "registered" && parts[1] === "skill") return skillLabel(catalog, parts[2]);
  const [owner, ownerId] = parts;
  if (owner === "skill") return skillLabel(catalog, ownerId);
  if (owner === "trait") {
    const sprite = catalog.sprites.find((s) => s.id === ownerId) ?? catalog.sprites.find((s) => s.id === `${ownerId}-1`);
    const name = sprite?.nameZh ?? sprite?.name ?? ownerId;
    const trait = sprite?.trait?.name;
    return { kind: "特性", name: trait ? `${name}·${trait}` : name };
  }
  if (owner === "status") {
    const s = catalog.statuses.find((x) => x.id === ownerId);
    return { kind: "状态", name: s?.nameZh ?? s?.name ?? ownerId };
  }
  if (owner === "mark") {
    const m = catalog.marks.find((x) => x.id === ownerId);
    return { kind: "印记", name: m?.nameZh ?? m?.name ?? ownerId };
  }
  if (owner === "weather") {
    const w = catalog.weather.find((x) => x.id === ownerId);
    return { kind: "天气", name: w?.nameZh ?? w?.name ?? ownerId };
  }
  return null;
}

/** 组装一条日志行（结果文本去掉末尾重复的来源名，如「（械斗）」）。 */
export function logRowOf(e: BattleEvent, catalog: Catalog): LogRow {
  const side = e.side === "player" || e.side === "enemy" ? e.side : "system";
  const src = sourceOf(e, catalog);
  let text = describeEvent(e, catalog);
  if (src?.name && text.endsWith(`（${src.name}）`)) text = text.slice(0, text.length - src.name.length - 2).trim();
  return { side, kind: src?.kind ?? "", source: src?.name ?? "", text, mechanism: mechanismHitOf(e) ?? undefined };
}
