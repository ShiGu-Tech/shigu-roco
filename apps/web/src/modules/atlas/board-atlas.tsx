"use client";

/** 对战台内嵌的「引擎流程回放」：把本局每回合命中的触发器按**发生顺序**逐个点亮小号全景图。
 *
 * 数据来自 `board.tsx` 每回合 `collectAtlasStep` 的产出（`BoardAtlas` 只做播放，不碰引擎）。
 * 回放粒度 = 触发器（`fired` 保序）；同一触发器跨回合重复出现会重复点亮。
 */

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import { flattenFirings } from "./collect";
import { LifecycleGraph } from "./lifecycle-graph";
import type { AtlasStep } from "./types";

const STEP_MS = 450;

export function BoardAtlas({ steps }: { steps: AtlasStep[] }) {
  /** 本局按发生顺序展开的触发器序列。 */
  const firings = useMemo(() => flattenFirings(steps), [steps]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);

  // 逐个推进（每 `STEP_MS` 走一个触发器）。新开局由父级 `key` 重挂载重置。
  useEffect(() => {
    if (!playing || cursor >= firings.length) return;
    const timer = setTimeout(() => setCursor((current) => current + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, cursor, firings.length]);

  const lit = useMemo(() => new Set(firings.slice(0, Math.min(cursor + 1, firings.length))), [firings, cursor]);
  const active = cursor < firings.length ? firings[cursor] : null;
  const total = firings.length;
  const atEnd = cursor >= total;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={total === 0 || atEnd}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "暂停" : "继续"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={total === 0}
          onClick={() => {
            setCursor(0);
            setPlaying(true);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重播
        </Button>
        <span className="text-[11px] text-muted-foreground tnum">
          {total === 0 ? "等待出招" : `第 ${Math.min(cursor + 1, total)} / ${total} 步`}
        </span>
        <span className="text-[11px] text-muted-foreground">
          当前：
          <span className="font-medium text-foreground">{active ? triggerMetaOf(active).title : total ? "已走完本回合" : "—"}</span>
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">▶ 高亮 = 引擎本步正走到的时机</span>
      </div>

      <LifecycleGraph
        layout="compact"
        litTriggers={lit}
        activeTrigger={active}
        containerClassName="h-[420px] w-full min-[860px]:h-[500px]"
      />
    </div>
  );
}
