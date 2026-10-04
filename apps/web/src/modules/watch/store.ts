/** 观战房间内存存储（服务端叶模块；无 `node:fs` / 无数据库）。
 *
 * 单进程 `Map` + 订阅广播（SSE 用）；TTL 12h、上限 200 房、单房最多 200 条，惰性清理。
 * 进程重启即清空（持久化为非目标，见设计稿 §7）。
 */

import { newRoomId } from "./ids";
import type { RoomSide, WatchRoom } from "./types";

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
  record.room = { ...room, entries: room.entries.slice(-MAX_ENTRIES), updatedAt: Date.now() };
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
