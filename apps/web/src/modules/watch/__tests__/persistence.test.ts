import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// 测试强制开启落盘并重定向到临时目录（须在首次调用 persistence 之前设置）。
const dir = mkdtempSync(path.join(tmpdir(), "watch-persist-"));
process.env.WATCH_PERSIST = "1";
process.env.WATCH_DATA_DIR = dir;

import { persistRoom, persistenceEnabled, readPersistedRooms, removePersistedRoom, watchDataDir } from "../persistence";
import type { WatchRoom } from "../types";

function room(id: string): WatchRoom {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "ended",
    seed: 1,
    player: { label: "我方", sprites: [] },
    enemy: { label: "敌方", sprites: [] },
    turn: 2,
    terminal: null,
    entries: [],
    head: 0,
    dataVersion: "d",
    engineVersion: "e",
  };
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("watch persistence", () => {
  it("仅在显式开启时启用且定位到指定目录", () => {
    expect(persistenceEnabled()).toBe(true);
    expect(watchDataDir()).toBe(dir);
  });

  it("写 → 读 → 删 round-trip", () => {
    persistRoom(room("r-aaa"));
    persistRoom(room("r-bbb"));
    expect(readPersistedRooms().map((r) => r.id).sort()).toEqual(["r-aaa", "r-bbb"]);
    removePersistedRoom("r-aaa");
    expect(readPersistedRooms().map((r) => r.id)).toEqual(["r-bbb"]);
  });
});
