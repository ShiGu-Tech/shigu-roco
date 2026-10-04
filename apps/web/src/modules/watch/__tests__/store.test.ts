import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_ENTRIES, MAX_ROOMS, ROOM_TTL_MS, createRoom, deleteRoom, getRoom, putRoom, roomCount, subscribe } from "../store";
import type { RoomSide, WatchEntry, WatchRoom } from "../types";

const side: RoomSide = { label: "我方", sprites: [{ id: "sp-1", name: "圣剑-X" }] };

function makeEntry(turn: number): WatchEntry {
  return { turn, label: `回合 ${turn}`, actions: [], step: { turn, actions: [], fired: [] }, log: [] };
}

function input() {
  return { seed: 42, player: side, enemy: side, dataVersion: "d1", engineVersion: "0.26.1" };
}

beforeEach(() => {
  delete (globalThis as { __rocoWatchRooms?: unknown }).__rocoWatchRooms;
  vi.useRealTimers();
});

describe("watch store（内存房间）", () => {
  it("建房：不可猜 id、live、空条目", () => {
    const room = createRoom(input());
    expect(room.id).toMatch(/^r-[0-9a-f]{24}$/);
    expect(room.status).toBe("live");
    expect(room.entries).toEqual([]);
    expect(getRoom(room.id)?.seed).toBe(42);
    expect(getRoom("r-nope")).toBeNull();
  });

  it("putRoom 覆盖并广播订阅者；未知房间返回 false", () => {
    const room = createRoom(input());
    let notified = 0;
    const off = subscribe(room.id, () => notified++);
    const ok = putRoom({ ...room, status: "ended", entries: [makeEntry(1)] });
    expect(ok).toBe(true);
    expect(notified).toBe(1);
    expect(getRoom(room.id)?.status).toBe("ended");
    expect(getRoom(room.id)?.entries).toHaveLength(1);
    off();
    putRoom({ ...room, entries: [makeEntry(2)] });
    expect(notified).toBe(1); // 退订后不再通知
    expect(putRoom({ ...room, id: "r-other" })).toBe(false);
  });

  it("单房条目超上限时头淘汰", () => {
    const room = createRoom(input());
    const entries = Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => makeEntry(i));
    putRoom({ ...room, entries });
    const stored = getRoom(room.id)!;
    expect(stored.entries).toHaveLength(MAX_ENTRIES);
    expect(stored.entries[0].turn).toBe(20);
  });

  it("未超 TTL 可读、超 TTL 惰性清理", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const alive = createRoom(input());
    vi.setSystemTime(ROOM_TTL_MS - 1);
    expect(getRoom(alive.id)).not.toBeNull();
  });

  it("超过 TTL 后读取为 null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dead = createRoom(input());
    vi.setSystemTime(ROOM_TTL_MS + 1);
    expect(getRoom(dead.id)).toBeNull();
  });

  it("房间数超上限时淘汰最旧", () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_ROOMS + 5; i++) {
      vi.setSystemTime(i * 1000);
      createRoom(input());
    }
    expect(roomCount()).toBeLessThanOrEqual(MAX_ROOMS);
  });

  it("删除房间", () => {
    const room = createRoom(input());
    expect(deleteRoom(room.id)).toBe(true);
    expect(getRoom(room.id)).toBeNull();
  });

  it("putRoom 更新 updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const room = createRoom(input());
    vi.setSystemTime(5000);
    putRoom(room as WatchRoom);
    expect(getRoom(room.id)?.updatedAt).toBe(5000);
  });

  it("head 归一：缺失按全披露、越界夹紧、0 保留", () => {
    const room = createRoom(input());
    const step = {
      turn: 1,
      actions: [],
      fired: [
        { trigger: "turnStart", mechanisms: [], effects: [] },
        { trigger: "beforeAction", mechanisms: [], effects: [] },
      ],
    };
    const entry: WatchEntry = { turn: 1, label: "回合 1", actions: [], step, log: [] };
    putRoom({ ...room, entries: [entry], head: undefined as unknown as number });
    expect(getRoom(room.id)?.head).toBe(2);
    putRoom({ ...room, entries: [entry], head: 99 });
    expect(getRoom(room.id)?.head).toBe(2);
    putRoom({ ...room, entries: [entry], head: 0 });
    expect(getRoom(room.id)?.head).toBe(0);
  });
});
