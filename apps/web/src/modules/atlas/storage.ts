/** 全景图轨迹：localStorage 会话存储（键 `roco.atlasTrace`）。
 *
 * 与回放同一心智：写入方（沙盒 / 对战台）每次成功步进后 `recordAtlasStep` 追加；
 * 新来源（source 不同或超过 10 分钟空窗）整体覆盖，同来源只追加（限额头淘汰）；
 * 超配额降级为只保留最近 5 步重写（同 `replays/storage.ts` 模式）。
 */

import type { AtlasStep, AtlasTrace } from "./types";

const TRACE_KEY = "roco.atlasTrace";

export const MAX_ATLAS_STEPS = 50;
/** 同来源追加的空窗上限：超过则视为新局覆盖。 */
export const TRACE_STALE_MS = 10 * 60 * 1000;

function read(): AtlasTrace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AtlasTrace;
    if (!parsed || !Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(trace: AtlasTrace): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(TRACE_KEY, JSON.stringify(trace));
    return true;
  } catch {
    return false;
  }
}

export function readAtlasTrace(): AtlasTrace | null {
  return read();
}

export function clearAtlasTrace(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TRACE_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 追加一步轨迹（同来源未过期则续写，否则覆盖为新轨迹）；超额头淘汰，配额不足降级到 5 步。 */
export function recordAtlasStep(source: AtlasTrace["source"], step: AtlasStep): AtlasTrace {
  const now = Date.now();
  const prev = read();
  const fresh = prev && prev.source === source && now - prev.updatedAt < TRACE_STALE_MS;
  const steps = fresh ? [...prev.steps, step] : [step];
  let trace: AtlasTrace = { source, updatedAt: now, steps: steps.slice(-MAX_ATLAS_STEPS) };
  if (!write(trace)) {
    trace = { ...trace, steps: trace.steps.slice(-5) };
    write(trace);
  }
  return trace;
}
