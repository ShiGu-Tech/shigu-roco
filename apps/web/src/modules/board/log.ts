import type { BattleEvent, Catalog } from "@/modules/battle/types";

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
    case "switch":
    case "stat-inherited":
    case "faint":
      return localizeIds(e.text, catalog);
    default:
      return localizeIds(e.text || e.type, catalog);
  }
}
