/** 服务端数据缓存（仅 Node runtime 使用）。
 *
 * 装配规则：引擎参数（rules / stats / assets / mechanisms）来自 data/*.json；
 * 精灵 / 技能 / 印记 / 天气 / 属性一律来自激活图鉴（现查）。没有激活图鉴直接报错，
 * 不做静态兜底。
 */

import { DataError } from "./data";
import { loadData } from "./data-node";
import { getActiveCatalog } from "./catalog";
import type { DataBundle, Dict } from "./types";

let cached: DataBundle | null = null;

export function getBundle(force = false): DataBundle {
  if (force || !cached) {
    const base = loadData();
    const registered = getActiveCatalog();
    if (!registered) {
      throw new DataError("未找到激活图鉴：请先同步并注册 roco.world 快照（node scripts/sync-roco-world.mjs --register）");
    }
    const skillMechanisms = registered.skills
      .filter((skill) => (skill.category === "Physical" || skill.category === "Magic") && Number(skill.power ?? 0) > 0)
      .map((skill) => ({
        id: `registered:skill:${String(skill.id)}`,
        ownerType: "skill",
        ownerId: String(skill.id),
        trigger: "beforeAction",
        when: [{ path: "event.action.skillId", op: "eq", value: String(skill.id) }],
        effects: [{ type: "dealDamage", target: "target", category: String(skill.category), power: Number(skill.power), skillId: String(skill.id) }],
      }));
    cached = {
      ...base,
      sprites: Object.fromEntries(registered.sprites.map((sprite) => [String(sprite.id), sprite])),
      skills: Object.fromEntries(registered.skills.map((skill) => [String(skill.id), skill])),
      marks: Object.fromEntries(registered.marks.map((mark) => [String(mark.id), mark])),
      weather: Object.fromEntries(registered.weather.map((item) => [String(item.id), item])),
      elements: registered.elements,
      mechanisms: [
        ...(base.mechanisms ?? []).filter((mechanism) => (mechanism as Dict).ownerType !== "skill"),
        ...skillMechanisms,
      ],
      dataVersion: registered.catalogVersion,
      dataUpdatedAt: registered.generatedAt,
      warnings: [...base.warnings, ...registered.warnings],
    };
  }
  return cached;
}

export function reloadBundle(): DataBundle {
  cached = null;
  return getBundle(true);
}
