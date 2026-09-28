import type { BattleState } from "./types";

const SAVES_KEY = "roco.saves";
const OPPONENT_KEY = "roco.opponentModel";
const LIBRARY_KEY = "roco.opponentLibrary";

export interface SaveEntry {
  id: string;
  name: string;
  createdAt: number;
  state: BattleState;
}

export interface OpponentLibraryEntry {
  seen: number;
  actions: { A: number; D: number; S: number };
  training: Record<string, number>;
}

export interface OpponentLibrary {
  version: number;
  opponents: Record<string, OpponentLibraryEntry>;
}

export function emptyLibrary(): OpponentLibrary {
  return { version: 1, opponents: {} };
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listSaves(): SaveEntry[] {
  return read<SaveEntry[]>(SAVES_KEY, []);
}

export function saveState(name: string, state: BattleState): SaveEntry[] {
  const entry: SaveEntry = { id: crypto.randomUUID(), name, createdAt: Date.now(), state };
  const next = [entry, ...listSaves()].slice(0, 50);
  write(SAVES_KEY, next);
  return next;
}

export function deleteSave(id: string): SaveEntry[] {
  const next = listSaves().filter((s) => s.id !== id);
  write(SAVES_KEY, next);
  return next;
}

// ---------------------------------------------------------------- 对手库

export function loadOpponentLibrary(): OpponentLibrary {
  const lib = read<OpponentLibrary | null>(LIBRARY_KEY, null);
  if (lib && typeof lib === "object" && lib.opponents) return lib;
  return emptyLibrary();
}

export function saveOpponentLibrary(library: OpponentLibrary): void {
  write(LIBRARY_KEY, library);
}

function entryOf(library: OpponentLibrary, spriteId: string): OpponentLibraryEntry {
  return library.opponents[spriteId] ?? { seen: 0, actions: { A: 0, D: 0, S: 0 }, training: {} };
}

export function recordOpponentAction(library: OpponentLibrary, spriteId: string, cls: "A" | "D" | "S"): OpponentLibrary {
  const entry = entryOf(library, spriteId);
  const actions = { ...entry.actions, [cls]: entry.actions[cls] + 1 };
  return {
    ...library,
    opponents: { ...library.opponents, [spriteId]: { ...entry, seen: entry.seen + 1, actions } },
  };
}

export function recordOpponentTraining(library: OpponentLibrary, spriteId: string, profileId: string): OpponentLibrary {
  const entry = entryOf(library, spriteId);
  const training = { ...entry.training, [profileId]: (entry.training[profileId] ?? 0) + 1 };
  return { ...library, opponents: { ...library.opponents, [spriteId]: { ...entry, training } } };
}

// ---------------------------------------------------------------- 兼容旧全局计数

export function loadOpponentModel(): Record<string, number> {
  return read<Record<string, number>>(OPPONENT_KEY, { A: 0, D: 0, S: 0 });
}

export function saveOpponentModel(counts: Record<string, number>): void {
  write(OPPONENT_KEY, counts);
}
