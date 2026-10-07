/** 精灵试验台 localStorage 持久化（离线 · 单人 · 无数据库）。 */

import type { LabSave } from "./types";

const KEY = "roco.lab";

export function loadLab(): LabSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LabSave) : null;
  } catch {
    return null;
  }
}

export function saveLab(save: LabSave): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // 配额 / 隐私模式下静默失败：试验台不因持久化失败而中断。
  }
}

export function clearLab(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
