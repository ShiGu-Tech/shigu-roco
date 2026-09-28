/** 数据层加载：把 data/*.json 读成只读 DataBundle，并做引用校验。
 *
 * 与 Python config.py 等价：未知 op / 引用只记 warning，不中断（数据先行）。
 * 本模块是纯函数，不含 fs —— Node 侧读盘见 data-node.ts。
 */

import type { DataBundle, Dict, RawDataFiles } from "./types";
import { asDict, toArray, toNum, toStr } from "./types";
import { mechanismsFromData } from "./mechanisms";

export class DataError extends Error {}

export const REQUIRED_FILES = {
  sprites: "sprites.json",
  skills: "skills.json",
  marks: "marks.json",
  weather: "weather.json",
  elements: "elements.json",
  rules: "rules.json",
} as const;

function indexItems(items: Dict[], key: string): Record<string, Dict> {
  const out: Record<string, Dict> = {};
  for (const item of items) {
    const k = toStr(item[key]);
    if (!k) throw new DataError(`条目缺少 ${key} 字段: ${JSON.stringify(item)}`);
    if (out[k]) throw new DataError(`${key} 重复: ${k}`);
    out[k] = item;
  }
  return out;
}

function hasElement(elements: Dict, name: string): boolean {
  const names = new Set<string>();
  for (const t of toArray<Dict>(elements.elements)) {
    names.add(toStr(t.name));
    names.add(toStr(t.shortName));
    names.add(toStr(t.nameZh));
  }
  return names.has(name);
}

export function buildBundle(raw: RawDataFiles): DataBundle {
  const warnings: string[] = [];
  const sprites = indexItems(toArray<Dict>(raw.sprites.sprites), "id");
  const skills = indexItems(toArray<Dict>(raw.skills.skills), "id");
  const marks = indexItems(toArray<Dict>(raw.marks.marks), "id");
  const weather = indexItems(toArray<Dict>(raw.weather.weather), "id");

  for (const [sid, sprite] of Object.entries(sprites)) {
    for (const skillId of toArray<string>(sprite.skillList)) {
      if (!skills[skillId]) warnings.push(`精灵 ${sid} 引用了未知技能: ${skillId}`);
    }
    for (const elem of toArray<string>(sprite.elements)) {
      if (!hasElement(raw.elements, elem)) warnings.push(`精灵 ${sid} 引用了未知属性: ${elem}`);
    }
  }
  return {
    sprites,
    skills,
    marks,
    weather,
    elements: raw.elements,
    rules: raw.rules,
    stats: (raw.stats ?? {}) as DataBundle["stats"],
    assets: raw.assets ?? {},
    mechanisms: mechanismsFromData(raw.mechanisms),
    warnings,
    dataVersion: toStr(raw.sprites.version, "0.0.0"),
    dataUpdatedAt: toStr(raw.sprites.updatedAt, ""),
  };
}

// ---------------------------------------------------------------- 查询

export function getSprite(bundle: DataBundle, spriteId: string): Dict {
  const v = bundle.sprites[spriteId];
  if (!v) throw new DataError(`未知精灵 id: ${spriteId}`);
  return v;
}

export function getSkill(bundle: DataBundle, skillId: string): Dict {
  const v = bundle.skills[skillId];
  if (!v) throw new DataError(`未知技能 id: ${skillId}`);
  return v;
}

export function getMark(bundle: DataBundle, markId: string): Dict {
  return bundle.marks[markId] ?? {};
}

export function getWeatherDef(bundle: DataBundle, weatherId: string): Dict {
  return bundle.weather[weatherId] ?? {};
}

export function counts(bundle: DataBundle): Record<string, number> {
  return {
    sprites: Object.keys(bundle.sprites).length,
    skills: Object.keys(bundle.skills).length,
    marks: Object.keys(bundle.marks).length,
    weather: Object.keys(bundle.weather).length,
  };
}

/** 双系倍率：逐系相乘，可被 overrides / clampTo 配置覆盖。 */
export function typeMultiplier(elements: Dict, attack: string, defend: string[]): number {
  const matrix = asDict(elements.matrix);
  const combine = asDict(elements.combine);
  const values = asDict(elements.values);
  const counter = toNum(values.counter, 2.0);
  const counter3 = toNum(values.counter3, 3.0);
  const counter4 = toNum(values.counter4, 4.0);
  const neutral = toNum(values.neutral, 1.0);
  const resisted = toNum(values.resisted, 0.5);
  const resisted3 = toNum(values.resisted3, 1 / 3);
  const resisted4 = toNum(values.resisted4, 0.25);

  const row = asDict(matrix[attack]);
  let mult = 1.0;
  for (const d of defend) {
    const entry = row[d];
    if (entry === undefined || entry === null) {
      mult *= neutral;
    } else if (typeof entry === "string") {
      mult *= entry === "counter" ? counter : entry === "counter3" ? counter3 : entry === "counter4" ? counter4 : entry === "resisted" ? resisted : entry === "resisted3" ? resisted3 : entry === "resisted4" ? resisted4 : neutral;
    } else {
      mult *= toNum(entry, neutral);
    }
  }

  for (const ov of toArray<Dict>(combine.overrides)) {
    if (toStr(ov.attack) !== attack) continue;
    const defendList = toArray<string>(ov.defend).slice().sort();
    const current = defend.slice().sort();
    if (defendList.length === current.length && defendList.every((v, i) => v === current[i])) {
      mult = toNum(ov.value, mult);
    }
  }

  const clamp = combine.clampTo;
  if (Array.isArray(clamp) && clamp.length === 2) {
    mult = Math.max(toNum(clamp[0], mult), Math.min(toNum(clamp[1], mult), mult));
  }
  return mult;
}

export function bundleTypeMultiplier(bundle: DataBundle, attack: string, defend: string[]): number {
  return typeMultiplier(bundle.elements, attack, defend);
}
