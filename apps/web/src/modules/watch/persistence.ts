/** 观战房间落盘（服务端）：每房一个 JSON 文件，供进程 / 容器重启后仍可回放。
 *
 * 目录复用引擎数据目录解析（`resolveDataDir()` / `ROCO_DATA_DIR`），可用 `WATCH_DATA_DIR` 覆盖；
 * `WATCH_PERSIST=0` 或 vitest（`VITEST`）关闭。原子写（tmp + rename），单房一文件。
 * 仅服务端使用（Route Handler / 测试），不进浏览器包。
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { resolveDataDir } from "@/modules/engine/data-node";

import type { WatchRoom } from "./types";

const SUBDIR = "watch";

/** 是否启用落盘（测试 / 显式关闭时返回 false）。 */
export function persistenceEnabled(): boolean {
  if (process.env.WATCH_PERSIST === "0") return false;
  if (process.env.WATCH_PERSIST === "1") return true;
  if (process.env.VITEST) return false;
  return true;
}

let dirCache: string | null | undefined;

/** 解析观战房间目录；返回 null 表示不落盘。 */
export function watchDataDir(): string | null {
  if (!persistenceEnabled()) return null;
  if (dirCache !== undefined) return dirCache;
  const explicit = process.env.WATCH_DATA_DIR;
  if (explicit) {
    dirCache = explicit;
    return dirCache;
  }
  try {
    dirCache = path.join(/* turbopackIgnore: true */ resolveDataDir(), SUBDIR);
  } catch {
    dirCache = path.join(/* turbopackIgnore: true */ process.cwd(), "data", SUBDIR);
  }
  return dirCache;
}

function fileFor(dir: string, id: string): string {
  return path.join(/* turbopackIgnore: true */ dir, `${id}.json`);
}

/** 读取全部已落盘房间（坏文件 / 非观战文件跳过）。 */
export function readPersistedRooms(): WatchRoom[] {
  const dir = watchDataDir();
  if (!dir || !existsSync(/* turbopackIgnore: true */ dir)) return [];
  const rooms: WatchRoom[] = [];
  for (const name of readdirSync(/* turbopackIgnore: true */ dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    try {
      const raw = JSON.parse(readFileSync(/* turbopackIgnore: true */ fileFor(dir, id), "utf8")) as WatchRoom;
      if (raw && typeof raw.id === "string" && Array.isArray(raw.entries)) rooms.push(raw);
    } catch {
      /* 跳过坏文件 */
    }
  }
  return rooms;
}

/** 写单房快照（原子：tmp → rename）。 */
export function persistRoom(room: WatchRoom): void {
  const dir = watchDataDir();
  if (!dir) return;
  try {
    mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    const file = fileFor(dir, room.id);
    const tmp = `${file}.tmp`;
    writeFileSync(/* turbopackIgnore: true */ tmp, JSON.stringify(room), "utf8");
    renameSync(/* turbopackIgnore: true */ tmp, file);
  } catch {
    /* 落盘失败不影响内存观战 */
  }
}

export function removePersistedRoom(id: string): void {
  const dir = watchDataDir();
  if (!dir) return;
  try {
    rmSync(/* turbopackIgnore: true */ fileFor(dir, id), { force: true });
  } catch {
    /* ignore */
  }
}

/** 清过期 / 超上限房间文件（best-effort）。 */
export function prunePersistedRooms(ttlMs: number, maxRooms: number): void {
  const dir = watchDataDir();
  if (!dir || !existsSync(/* turbopackIgnore: true */ dir)) return;
  try {
    const now = Date.now();
    const files = readdirSync(/* turbopackIgnore: true */ dir).filter((name) => name.endsWith(".json"));
    const stats = files.map((name) => {
      const p = path.join(/* turbopackIgnore: true */ dir, name);
      return { name, mtime: statSync(/* turbopackIgnore: true */ p).mtimeMs };
    });
    for (const { name, mtime } of stats) {
      if (now - mtime > ttlMs) rmSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dir, name), { force: true });
    }
    const alive = stats.filter((s) => now - s.mtime <= ttlMs).sort((a, b) => b.mtime - a.mtime);
    for (let i = maxRooms; i < alive.length; i++) {
      rmSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dir, alive[i].name), { force: true });
    }
  } catch {
    /* ignore */
  }
}
