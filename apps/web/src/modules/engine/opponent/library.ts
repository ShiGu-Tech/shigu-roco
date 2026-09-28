/** 对手库：持久化「某对手精灵 → 出招分布 + 养成档位计数」。
 *
 * 引擎无状态：库由前端 localStorage 保存，随 /recommend 请求传入，
 * 响应回传后由前端写回。结构见《养成资质 + 对手库 · 设计 v0.1》。
 */

import { CLASSES, type ActionClass } from "./bayes";
import type { TrainingProfileDef } from "../types";

export interface OpponentEntry {
  seen: number;
  actions: Record<ActionClass, number>;
  /** 养成档位 id → 计数。 */
  training: Record<string, number>;
}

export interface OpponentLibrary {
  version: number;
  opponents: Record<string, OpponentEntry>;
}

export function emptyEntry(): OpponentEntry {
  return { seen: 0, actions: { A: 0, D: 0, S: 0 }, training: {} };
}

export function emptyLibrary(): OpponentLibrary {
  return { version: 1, opponents: {} };
}

export function normalizeLibrary(raw: unknown): OpponentLibrary {
  if (!raw || typeof raw !== "object") return emptyLibrary();
  const obj = raw as Partial<OpponentLibrary>;
  const opponents: Record<string, OpponentEntry> = {};
  for (const [id, entry] of Object.entries(obj.opponents ?? {})) {
    const e = entry as Partial<OpponentEntry>;
    opponents[id] = {
      seen: Number(e.seen ?? 0) || 0,
      actions: {
        A: Number(e.actions?.A ?? 0) || 0,
        D: Number(e.actions?.D ?? 0) || 0,
        S: Number(e.actions?.S ?? 0) || 0,
      },
      training: { ...(e.training ?? {}) },
    };
  }
  return { version: Number(obj.version ?? 1) || 1, opponents };
}

export function getEntry(library: OpponentLibrary, spriteId: string): OpponentEntry {
  return library.opponents[spriteId] ?? emptyEntry();
}

/** 把对手库中某精灵的出招计数转成 A/D/S 计数数组（与 CLASSES 同序）。 */
export function actionCountsFor(library: OpponentLibrary, spriteId: string): number[] {
  const entry = getEntry(library, spriteId);
  return CLASSES.map((c) => entry.actions[c] ?? 0);
}

/** 把对手库中某精灵的养成计数转成与 profiles 同序的计数数组。 */
export function trainingCountsFor(
  library: OpponentLibrary,
  spriteId: string,
  profiles: TrainingProfileDef[],
): number[] {
  const entry = getEntry(library, spriteId);
  return profiles.map((p) => entry.training[p.id] ?? 0);
}
