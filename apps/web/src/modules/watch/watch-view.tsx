"use client";

/** 观战页：订阅房间 → 按发生顺序点亮引擎全景图 + 事件记录。
 *
 * 进行中（live）自动跟随新条目；结束后（ended）可暂停 / 重播 / 拖动。传输为 SSE（断线由 EventSource 自动重连）。
 */

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { flattenFirings } from "@/modules/atlas/collect";
import { LifecycleGraph } from "@/modules/atlas/lifecycle-graph";
import { useAtlasPlayback } from "@/modules/atlas/use-atlas-playback";
import type { AtlasMechanism } from "@/modules/atlas/types";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import type { RoomSide, WatchRoom } from "./types";

const SIDE_LABEL: Record<string, string> = { player: "我方", enemy: "敌方" };

function RosterCard({ side, tone }: { side: RoomSide; tone: "player" | "enemy" }) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-baseline gap-2">
        <span className={tone === "player" ? "text-[13px] font-semibold" : "text-[13px] font-semibold text-right ml-auto"}>{side.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {side.sprites.map((sprite, i) => (
          <span key={`${sprite.id}-${i}`} className="rounded-sm border bg-background px-1.5 py-0.5 text-[11px]">
            {sprite.name}
          </span>
        ))}
        {side.sprites.length === 0 ? <span className="text-[11px] text-muted-foreground">—</span> : null}
      </div>
    </div>
  );
}

export function WatchView({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<WatchRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mechanisms, setMechanisms] = useState<AtlasMechanism[]>([]);

  useEffect(() => {
    fetch("/api/engine/workbench/mechanisms", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: { mechanisms: AtlasMechanism[] }) => setMechanisms(payload.mechanisms))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/watch/rooms/${roomId}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setError("房间不存在或已过期");
          return;
        }
        if (!cancelled) setRoom((await res.json()) as WatchRoom);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    const source = new EventSource(`/api/watch/rooms/${roomId}/stream`);
    source.addEventListener("room", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as WatchRoom;
        if (!cancelled) setRoom(data);
      } catch {
        /* 忽略坏帧 */
      }
    });
    source.addEventListener("gone", () => {
      if (!cancelled) setError("观战已结束（房间已清理）");
    });
    return () => {
      cancelled = true;
      source.close();
    };
  }, [roomId]);

  const grouped = useMemo(() => {
    const map = new Map<string, AtlasMechanism[]>();
    for (const item of mechanisms) {
      const list = map.get(item.trigger);
      if (list) list.push(item);
      else map.set(item.trigger, [item]);
    }
    return map;
  }, [mechanisms]);

  const firings = useMemo(() => flattenFirings((room?.entries ?? []).map((entry) => entry.step)), [room]);
  const { cursor, setCursor, playing, setPlaying, lit, active, total, atEnd } = useAtlasPlayback(firings, { stepMs: 500 });

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
        {error}（房间 {roomId}）
      </div>
    );
  }
  if (!room) return <p className="text-[13px] text-muted-foreground">正在连接观战房间…</p>;

  const live = room.status === "live";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2">
        <Badge variant={live ? "default" : "secondary"}>{live ? "实时" : "已结束"}</Badge>
        <span className="font-medium">引擎内部流程观战</span>
        <span className="text-[11px] text-muted-foreground tnum">{room.id}</span>
        <span className="text-[12px] text-muted-foreground tnum">第 {room.turn} 回合</span>
        {room.terminal ? (
          <span className="text-[12px] text-foreground">
            {room.terminal.winner ? `${room.terminal.winner === "player" ? "我方" : "敌方"}胜 · ` : ""}
            {room.terminal.reason}
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground tnum">数据 {room.dataVersion || "—"} · 引擎 {room.engineVersion}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[860px]:grid-cols-2">
        <RosterCard side={room.player} tone="player" />
        <RosterCard side={room.enemy} tone="enemy" />
      </div>

      <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="引擎内部流程（按发生顺序点亮）" bodyClassName="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="button" size="sm" variant="outline" disabled={total === 0} onClick={() => setPlaying(!playing)}>
              {playing ? "暂停" : "播放"}
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
              重播
            </Button>
            {live ? (
              <Button type="button" size="sm" variant="ghost" disabled={atEnd} onClick={() => setCursor(total)}>
                跳到最新
              </Button>
            ) : null}
            <input
              type="range"
              min={0}
              max={Math.max(total, 1)}
              value={Math.min(cursor, total)}
              onChange={(event) => {
                setPlaying(false);
                setCursor(Number(event.target.value));
              }}
              className="h-1 min-w-[120px] flex-1 cursor-pointer accent-primary"
              aria-label="回放进度"
            />
            <span className="text-[11px] text-muted-foreground tnum">
              {total === 0 ? "等待出招" : `第 ${Math.min(cursor + 1, total)} / ${total} 步`}
            </span>
            <span className="text-[11px] text-muted-foreground">
              当前：<span className="font-medium text-foreground">{active ? triggerMetaOf(active).title : total ? "已走完" : "—"}</span>
            </span>
          </div>

          <LifecycleGraph
            grouped={grouped}
            litTriggers={lit}
            activeTrigger={active}
            containerClassName="h-[560px] w-full min-[860px]:h-[640px]"
          />
        </Panel>

        <Panel title="事件记录" bodyClassName="min-h-0 overflow-y-auto" className="min-h-[320px]">
          {room.entries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">等待第一条记录…</p>
          ) : (
            <div className="space-y-2">
              {room.entries.map((entry, index) => (
                <div key={index} className="rounded-md border bg-card p-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px] font-semibold">{entry.label}</span>
                    <span className="text-[11px] text-muted-foreground">{entry.actions.map((action) => `${SIDE_LABEL[action.side] ?? action.side} ${action.label}`).join(" · ")}</span>
                  </div>
                  {entry.log.length ? (
                    <div className="mt-1 space-y-0.5">
                      {entry.log.map((line, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                          <span className="mt-[3px] shrink-0 text-[8px] leading-none">●</span>
                          <span>{line.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
