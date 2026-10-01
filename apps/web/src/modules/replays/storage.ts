/** 对战记录：把「当时的 frames 快照 + catalog 快照」存 localStorage，供离线回放。
 *
 * 两层存储：
 * - `roco.replays`：记录列表（每局含逐帧 state / log / history / terminal）。
 * - `roco.replayCatalogs`：按 `dataVersion@DataUpdatedAt` 归档的完整 Catalog，多条记录共享去重。
 */

import type { Catalog } from "@/modules/battle/types";

import type { Replay, ReplayCatalog, ReplayFrame } from "./types";

const REPLAYS_KEY = "roco.replays";
const CATALOGS_KEY = "roco.replayCatalogs";

export const MAX_REPLAYS = 50;
export const MAX_FRAMES = 200;

/** 当时数据版本的稳定 key；同一份 catalog 只归档一次。 */
export function replayCatalogKey(catalog: Pick<Catalog, "dataVersion" | "dataUpdatedAt">): string {
  return `${catalog.dataVersion}@${catalog.dataUpdatedAt}`;
}

/** 把完整 catalog 裁剪成「本局实际引用到的」子集，仍是当时快照，但体积从 MB 级降到百 KB 级。
 *
 * 保留：引用到的 sprites（连其自带 skills）、loadout/事件里出现的 skills、状态 / 印记 / 天气，
 * 以及 elements / bloodlines / rules / stats 等渲染必需的小字段。 */
export function pruneCatalog(catalog: Catalog, frames: ReplayFrame[]): Catalog {
  const spriteIds = new Set<string>();
  const skillIds = new Set<string>();
  const statusIds = new Set<string>();
  const markIds = new Set<string>();
  const weatherIds = new Set<string>();

  type ActiveLike = { spriteId?: string; loadout?: string[]; statuses?: Record<string, number>; marks?: Record<string, number> };
  type SideLike = { active?: ActiveLike; bench?: ActiveLike[] };
  const visit = (side: SideLike | undefined) => {
    if (!side) return;
    const actives: (ActiveLike | undefined)[] = [side.active, ...(side.bench ?? [])];
    for (const a of actives) {
      if (!a) continue;
      if (a.spriteId) spriteIds.add(a.spriteId);
      for (const s of a.loadout ?? []) skillIds.add(s);
      for (const k of Object.keys(a.statuses ?? {})) statusIds.add(k);
      for (const k of Object.keys(a.marks ?? {})) markIds.add(k);
    }
  };

  for (const f of frames) {
    visit(f.state?.player as SideLike | undefined);
    visit(f.state?.enemy as SideLike | undefined);
    if (f.state?.weather?.id) weatherIds.add(f.state.weather.id);
    for (const e of f.log ?? []) {
      const d = (e.data ?? {}) as Record<string, unknown>;
      if (d.skillId) skillIds.add(String(d.skillId));
      if (d.markId) markIds.add(String(d.markId));
      if (d.statusId) statusIds.add(String(d.statusId));
      if (d.weatherId) weatherIds.add(String(d.weatherId));
    }
  }

  const sprites = (catalog.sprites ?? []).filter((s) => spriteIds.has(s.id));
  for (const s of sprites) for (const sk of s.skills ?? []) skillIds.add(sk.id);

  return {
    ...catalog,
    sprites,
    allSkills: (catalog.allSkills ?? []).filter((s) => skillIds.has(s.id)),
    statuses: (catalog.statuses ?? []).filter((s) => statusIds.has(s.id)),
    marks: (catalog.marks ?? []).filter((m) => markIds.has(m.id)),
    weather: (catalog.weather ?? []).filter((w) => weatherIds.has(w.id)),
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 记录

export function listReplays(): Replay[] {
  const list = readJson<Replay[]>(REPLAYS_KEY, []);
  return Array.isArray(list) ? [...list].sort((a, b) => b.createdAt - a.createdAt) : [];
}

export function getReplay(id: string): Replay | undefined {
  return listReplays().find((r) => r.id === id);
}

export interface SaveReplayInput {
  name: string;
  catalog: Catalog;
  frames: ReplayFrame[];
  seed: number;
  playerLabel: string;
  enemyLabel: string;
}

export type SaveReplayResult = { ok: true; replay: Replay; truncated: boolean } | { ok: false; error: string };

export function saveReplay(input: SaveReplayInput): SaveReplayResult {
  if (typeof window === "undefined") return { ok: false, error: "当前环境不支持本地保存" };
  if (input.frames.length === 0) return { ok: false, error: "还没有可保存的回合" };

  const frames = input.frames.slice(0, MAX_FRAMES);
  const truncated = input.frames.length > MAX_FRAMES;
  const last = frames[frames.length - 1];
  const terminal = last?.terminal ?? null;
  const first = frames[0];

  const replay: Replay = {
    id: crypto.randomUUID(),
    name: input.name.trim() || `对战记录 ${new Date().toLocaleString("zh-CN")}`,
    createdAt: Date.now(),
    catalogKey: replayCatalogKey(input.catalog),
    seed: Number(input.seed ?? first?.state.seed ?? 0),
    playerLabel: input.playerLabel,
    enemyLabel: input.enemyLabel,
    winner: terminal?.winner ?? null,
    reason: terminal?.reason ?? "",
    turns: last?.turn ?? first?.turn ?? 1,
    frames,
  };

  // 先归档 catalog 快照（同版本复用）。
  const key = replay.catalogKey;
  const catalogs = readJson<Record<string, ReplayCatalog>>(CATALOGS_KEY, {});
  if (!catalogs[key]) {
    catalogs[key] = {
      key,
      dataVersion: input.catalog.dataVersion,
      dataUpdatedAt: input.catalog.dataUpdatedAt,
      catalog: pruneCatalog(input.catalog, frames),
    };
    if (!writeJson(CATALOGS_KEY, catalogs)) {
      return { ok: false, error: "浏览器存储空间不足，无法归档图鉴快照" };
    }
  }

  const next = [replay, ...listReplays()].slice(0, MAX_REPLAYS);
  if (!writeJson(REPLAYS_KEY, next)) {
    return { ok: false, error: "浏览器存储空间不足，保存失败（可先删除旧记录）" };
  }
  return { ok: true, replay, truncated };
}

export function renameReplay(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  writeJson(
    REPLAYS_KEY,
    listReplays().map((r) => (r.id === id ? { ...r, name: trimmed } : r)),
  );
}

export function deleteReplay(id: string): void {
  const next = listReplays().filter((r) => r.id !== id);
  writeJson(REPLAYS_KEY, next);
  // 回收不再被引用的 catalog 快照。
  const used = new Set(next.map((r) => r.catalogKey));
  const catalogs = readJson<Record<string, ReplayCatalog>>(CATALOGS_KEY, {});
  const kept: Record<string, ReplayCatalog> = {};
  for (const [k, v] of Object.entries(catalogs)) if (used.has(k)) kept[k] = v;
  writeJson(CATALOGS_KEY, kept);
}

// ---------------------------------------------------------------- 快照

export function getReplayCatalog(key: string): ReplayCatalog | undefined {
  return readJson<Record<string, ReplayCatalog>>(CATALOGS_KEY, {})[key];
}

// ---------------------------------------------------------------- 导入 / 导出

export interface ReplayBundle {
  kind: "shigu-rock-replay";
  version: 1;
  exportedAt: number;
  replays: Replay[];
  catalogs: Record<string, ReplayCatalog>;
}

/** 导出（默认全部）记录为可离线转移的 bundle：内嵌各自引用的 catalog 快照。 */
export function exportBundle(ids?: string[]): ReplayBundle {
  const all = listReplays();
  const replays = ids && ids.length ? all.filter((r) => ids.includes(r.id)) : all;
  const catalogs = readJson<Record<string, ReplayCatalog>>(CATALOGS_KEY, {});
  const picked: Record<string, ReplayCatalog> = {};
  for (const r of replays) if (catalogs[r.catalogKey]) picked[r.catalogKey] = catalogs[r.catalogKey];
  return { kind: "shigu-rock-replay", version: 1, exportedAt: Date.now(), replays, catalogs: picked };
}

/** 校验并解析导入内容（纯函数，便于测试）。 */
export function parseBundle(raw: unknown): { replays: Replay[]; catalogs: Record<string, ReplayCatalog> } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "shigu-rock-replay" || !Array.isArray(o.replays)) return null;
  return {
    replays: o.replays as Replay[],
    catalogs: (o.catalogs as Record<string, ReplayCatalog> | undefined) ?? {},
  };
}

export type ImportResult = { ok: true; added: number; skipped: number } | { ok: false; error: string };

/** 合并导入：同 id 跳过、catalog 快照按 key 补齐，超额从尾部淘汰。 */
export function importBundle(raw: unknown): ImportResult {
  const parsed = parseBundle(raw);
  if (!parsed) return { ok: false, error: "文件格式不正确（不是本工具导出的对战记录）" };
  if (typeof window === "undefined") return { ok: false, error: "当前环境不支持导入" };

  const existing = listReplays();
  const existingIds = new Set(existing.map((r) => r.id));
  const added = parsed.replays.filter((r) => r?.id && !existingIds.has(r.id));
  const skipped = parsed.replays.length - added.length;

  const catalogs = readJson<Record<string, ReplayCatalog>>(CATALOGS_KEY, {});
  for (const [k, v] of Object.entries(parsed.catalogs)) if (!catalogs[k]) catalogs[k] = v;
  const nextReplays = [...added, ...existing].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_REPLAYS);

  if (!writeJson(CATALOGS_KEY, catalogs)) return { ok: false, error: "浏览器存储空间不足，导入失败" };
  if (!writeJson(REPLAYS_KEY, nextReplays)) return { ok: false, error: "浏览器存储空间不足，导入失败" };
  return { ok: true, added: added.length, skipped };
}
