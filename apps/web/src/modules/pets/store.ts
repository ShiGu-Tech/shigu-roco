/** 精灵仓库持久化：浏览器 localStorage（无数据库 / 不联网）。
 *
 * key `roco.pets`，结构 `{ version, instances, updatedAt }`。
 * 读盘做容错归一化；写盘失败（隐私模式 / 超配额）静默忽略，不阻断 UI。
 */

import { DEFAULT_LEVEL, DEFAULT_STARS, newInstance, type PetInstance, type TalentMap } from "./instance";
import { STAT_KEYS } from "../engine/stats";

const KEY = "roco.pets";
const VERSION = 1;

export interface PetStore {
  version: number;
  instances: PetInstance[];
  updatedAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeInstance(raw: unknown): PetInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<PetInstance> & Record<string, unknown>;
  const spriteId = typeof obj.spriteId === "string" ? obj.spriteId : "";
  if (!spriteId) return null;
  const now = Date.now();
  const talent: TalentMap = {};
  if (obj.talent && typeof obj.talent === "object") {
    for (const key of STAT_KEYS) {
      const value = (obj.talent as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) talent[key] = value;
    }
  }
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : newInstance(spriteId, now).id,
    name: typeof obj.name === "string" ? obj.name : undefined,
    spriteId,
    level: typeof obj.level === "number" && Number.isFinite(obj.level) ? obj.level : DEFAULT_LEVEL,
    stars: typeof obj.stars === "number" && Number.isFinite(obj.stars) ? obj.stars : DEFAULT_STARS,
    nature: typeof obj.nature === "string" ? obj.nature : null,
    bloodline: typeof obj.bloodline === "string" ? obj.bloodline : undefined,
    talent,
    skills: Array.isArray(obj.skills) ? obj.skills.filter((s): s is string => typeof s === "string") : [],
    note: typeof obj.note === "string" ? obj.note : undefined,
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : now,
  };
}

function readStore(): PetStore {
  if (!isBrowser()) return { version: VERSION, instances: [], updatedAt: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { version: VERSION, instances: [], updatedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<PetStore>;
    const instances = Array.isArray(parsed.instances)
      ? parsed.instances.map(normalizeInstance).filter((v): v is PetInstance => v !== null)
      : [];
    return { version: Number(parsed.version ?? VERSION) || VERSION, instances, updatedAt: Number(parsed.updatedAt ?? 0) || 0 };
  } catch {
    return { version: VERSION, instances: [], updatedAt: 0 };
  }
}

function writeStore(store: PetStore): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...store, updatedAt: Date.now() }));
  } catch {
    /* 容量 / 隐私模式忽略 */
  }
}

export function listPets(): PetInstance[] {
  return readStore().instances.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPet(id: string): PetInstance | undefined {
  return readStore().instances.find((p) => p.id === id);
}

/** 新增或更新（`id` 命中的覆盖；否则补发 id 追加）。返回最新列表。 */
export function upsertPet(instance: PetInstance): PetInstance[] {
  const store = readStore();
  const next: PetInstance = { ...instance, id: instance.id || newInstance(instance.spriteId).id, updatedAt: Date.now() };
  const exists = store.instances.some((p) => p.id === next.id);
  store.instances = exists ? store.instances.map((p) => (p.id === next.id ? next : p)) : [next, ...store.instances];
  writeStore(store);
  return listPets();
}

export function deletePet(id: string): PetInstance[] {
  const store = readStore();
  store.instances = store.instances.filter((p) => p.id !== id);
  writeStore(store);
  return listPets();
}

export function exportPets(): string {
  const store = readStore();
  return JSON.stringify({ version: VERSION, instances: store.instances }, null, 2);
}

/** 合并导入：按 id 去重（已存在则跳过），返回新增 / 跳过数。 */
export function importPets(json: string): { added: number; skipped: number } {
  const store = readStore();
  let incoming: unknown[];
  try {
    const parsed = JSON.parse(json) as { instances?: unknown } | unknown[];
    incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed.instances) ? parsed.instances : [];
  } catch {
    return { added: 0, skipped: 0 };
  }
  const existing = new Set(store.instances.map((p) => p.id));
  let added = 0;
  let skipped = 0;
  for (const raw of incoming) {
    const instance = normalizeInstance(raw);
    if (!instance) {
      skipped += 1;
      continue;
    }
    if (existing.has(instance.id)) {
      skipped += 1;
      continue;
    }
    existing.add(instance.id);
    store.instances.unshift(instance);
    added += 1;
  }
  writeStore(store);
  return { added, skipped };
}
