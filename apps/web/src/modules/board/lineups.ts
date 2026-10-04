/** 阵容库：把「我方 6 只（含资质 / 技能）」或「对方 6 只（只精灵）」存到 localStorage，供快速套用。 */

import type { TeamEntry } from "./util";

const KEY = "roco.lineups";

export type LineupScope = "player" | "enemy";

export interface Lineup {
  id: string;
  scope: LineupScope;
  name: string;
  updatedAt: number;
  entries: TeamEntry[];
}

function read(): Lineup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Lineup[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: Lineup[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 容量 / 隐私模式忽略 */
  }
}

export function listLineups(scope: LineupScope): Lineup[] {
  return read()
    .filter((l) => l.scope === scope)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 同名同侧则覆盖更新，否则新增。 */
export function saveLineup(scope: LineupScope, name: string, entries: TeamEntry[]): Lineup[] {
  const all = read();
  const trimmed = name.trim();
  const existing = all.find((l) => l.scope === scope && l.name === trimmed);
  const entry: Lineup = {
    id: existing?.id ?? crypto.randomUUID(),
    scope,
    name: trimmed,
    updatedAt: Date.now(),
    entries: structuredClone(entries),
  };
  const next = existing ? all.map((l) => (l.id === existing.id ? entry : l)) : [entry, ...all];
  write(next);
  return listLineups(scope);
}

export function deleteLineup(id: string): void {
  write(read().filter((l) => l.id !== id));
}

export function scopeLabel(scope: LineupScope): string {
  return scope === "player" ? "红方" : "蓝方";
}
