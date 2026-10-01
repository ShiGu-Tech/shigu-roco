"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

export interface TimelineFrame {
  turn: number;
  label: string;
}

/** 回合时间线：点某一帧回到该回合开始前；「撤销上一回合」回退一格。 */
export function Timeline({
  frames,
  cursor,
  busy,
  onJump,
  onUndo,
}: {
  frames: TimelineFrame[];
  cursor: number;
  busy?: boolean;
  onJump: (index: number) => void;
  onUndo: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">
          点某回合 = 回到该回合开始前（其后记录丢弃、可重打）
        </span>
        <Button type="button" size="sm" variant="outline" disabled={busy || cursor <= 0} onClick={onUndo}>
          撤销上一回合
        </Button>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {frames.map((f, i) => (
          <button
            key={i}
            type="button"
            disabled={busy}
            onClick={() => onJump(i)}
            title={f.label}
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors",
              i === cursor
                ? "border-primary bg-primary text-primary-foreground"
                : i < cursor
                  ? "border-border bg-card hover:border-primary/50 hover:bg-accent"
                  : "border-dashed border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <span className="tnum font-medium">回合 {f.turn}</span>
            {f.label !== `回合 ${f.turn}` ? (
              <span className="ml-1 opacity-70">{f.label.replace(/^回合 \d+\s*/, "")}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
