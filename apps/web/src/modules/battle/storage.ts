import type { BattleState } from "./types";

const SAVES_KEY = "roco.saves";
const OPPONENT_KEY = "roco.opponentModel";

export interface SaveEntry {
  id: string;
  name: string;
  createdAt: number;
  state: BattleState;
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

export function loadOpponentModel(): Record<string, number> {
  return read<Record<string, number>>(OPPONENT_KEY, { A: 0, D: 0, S: 0 });
}

export function saveOpponentModel(counts: Record<string, number>): void {
  write(OPPONENT_KEY, counts);
}
