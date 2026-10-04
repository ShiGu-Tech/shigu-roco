/** 观战房间内存存储（服务端叶模块）：单进程 `Map` + 订阅广播（SSE 用）。
 *
 * TTL 12h、上限 200 房、单房最多 200 条，惰性清理；`head` 为主机逐触发器披露游标（见设计稿 §11）。
 * 持久化由 `persistence.ts` 负责（`ensureLoaded` 落盘回填 + 路由侧写盘），本模块只管内存。
 */

import { flattenFirings } from "@/modules/atlas/collect";

import { newRoomId } from "./ids";
import { prunePersistedRooms, readPersistedRooms } from "./persistence";
import type { RoomSide, WatchEntry, WatchRoom } from "./types";

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_ROOMS = 200;
export const MAX_ENTRIES = 200;

interface RoomRecord {
  room: WatchRoom;
  listeners: Set<() => void>;
  touchedAt: number;
}

function registry(): Map<string, RoomRecord> {
  const scope = globalThis as { __rocoWatchRooms?: Map<string, RoomRecord> };
  if (!scope.__rocoWatchRooms) scope.__rocoWatchRooms = new Map();
  return scope.__rocoWatchRooms;
}

/** 惰性清理：过期房间 + 超上限时淘汰最久未活动者。 */
function sweep(now: number): void {
  const map = registry();
  for (const [id, record] of map) if (now - record.touchedAt > ROOM_TTL_MS) map.delete(id);
  if (map.size > MAX_ROOMS) {
    const byAge = [...map.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
    for (let i = 0; i < byAge.length - MAX_ROOMS; i++) map.delete(byAge[i][0]);
  }
}

function totalFirings(entries: WatchEntry[]): number {
  return flattenFirings(entries.map((entry) => entry.step)).length;
}

/** 规范化：条目头淘汰 + `head` 夹到 `[0, 总 firing 数]`（缺失按全披露）。 */
function normalizeRoom(room: WatchRoom): WatchRoom {
  const entries = room.entries.slice(-MAX_ENTRIES);
  const total = totalFirings(entries);
  const rawHead = typeof room.head === "number" && Number.isFinite(room.head) ? Math.floor(room.head) : total;
  return { ...room, entries, head: Math.max(0, Math.min(rawHead, total)) };
}

function seedRoom(room: WatchRoom, now: number): void {
  const map = registry();
  if (map.has(room.id)) return; // 不覆盖内存中可能更新的
  map.set(room.id, { room: normalizeRoom(room), listeners: new Set(), touchedAt: room.updatedAt || now });
}

let loadPromise: Promise<void> | null = null;

/** 路由入口调用：首次把落盘房间回填内存（memoized）。 */
export async function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      prunePersistedRooms(ROOM_TTL_MS, MAX_ROOMS);
      const now = Date.now();
      const rooms = readPersistedRooms()
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, MAX_ROOMS);
      for (const room of rooms) seedRoom(room, now);
    })().catch(() => {});
  }
  return loadPromise;
}

export interface CreateRoomInput {
  seed: number;
  player: RoomSide;
  enemy: RoomSide;
  dataVersion: string;
  engineVersion: string;
}

export function createRoom(input: CreateRoomInput): WatchRoom {
  const now = Date.now();
  const room: WatchRoom = {
    id: newRoomId(),
    createdAt: now,
    updatedAt: now,
    status: "live",
    turn: 1,
    terminal: null,
    entries: [],
    head: 0,
    ...input,
  };
  registry().set(room.id, { room, listeners: new Set(), touchedAt: now });
  sweep(now); // 插入后清理，保证房间数不超上限
  return room;
}

export function getRoom(id: string): WatchRoom | null {
  const record = registry().get(id);
  if (!record) return null;
  const now = Date.now();
  if (now - record.touchedAt > ROOM_TTL_MS) {
    registry().delete(id);
    return null;
  }
  record.touchedAt = now;
  return record.room;
}

/** 全量覆盖快照并广播（宿主推）。返回是否命中房间。 */
export function putRoom(room: WatchRoom): boolean {
  const record = registry().get(room.id);
  if (!record) return false;
  record.room = normalizeRoom({ ...room, updatedAt: Date.now() });
  record.touchedAt = Date.now();
  for (const listener of record.listeners) {
    try {
      listener();
    } catch {
      /* 单个订阅者异常不影响其它 */
    }
  }
  return true;
}

export function deleteRoom(id: string): boolean {
  return registry().delete(id);
}

/** 订阅房间变更（SSE 用）；返回退订函数。 */
export function subscribe(id: string, listener: () => void): () => void {
  const record = registry().get(id);
  if (!record) return () => {};
  record.listeners.add(listener);
  return () => {
    record.listeners.delete(listener);
  };
}

/** 测试 / 诊断用。 */
export function roomCount(): number {
  return registry().size;
}
