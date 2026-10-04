"use client";

/** 回放游标：把触发器序列按 `stepMs` 逐个推进，产出「已点亮」集合与「当前」高亮。
 *
 * 供观战页使用（`/watch`）。`firings` 增长时游标自动续走（实时跟随）；`setCursor` 可拖动。
 */

import { useEffect, useMemo, useState } from "react";

export interface AtlasPlayback {
  cursor: number;
  setCursor: (next: number) => void;
  playing: boolean;
  setPlaying: (next: boolean) => void;
  /** 已走过（含当前）的触发器。 */
  lit: Set<string>;
  /** 当前正在高亮的触发器。 */
  active: string | null;
  total: number;
  atEnd: boolean;
}

export function useAtlasPlayback(firings: string[], options: { stepMs?: number } = {}): AtlasPlayback {
  const stepMs = options.stepMs ?? 450;
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || cursor >= firings.length) return;
    const timer = setTimeout(() => setCursor((current) => current + 1), stepMs);
    return () => clearTimeout(timer);
  }, [playing, cursor, firings.length, stepMs]);

  const lit = useMemo(() => new Set(firings.slice(0, Math.min(cursor + 1, firings.length))), [firings, cursor]);
  const active = cursor < firings.length ? firings[cursor] : null;

  return { cursor, setCursor, playing, setPlaying, lit, active, total: firings.length, atEnd: cursor >= firings.length };
}
