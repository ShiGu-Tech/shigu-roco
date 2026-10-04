"use client";

/** 观战页：订阅房间 → 按发生顺序点亮引擎全景图 + 事件记录。
 *
 * 传输为 SSE（断线由 EventSource 自动重连）。进行中（live）默认**跟随主机披露游标**（`room.head`，见设计稿 §11）；
 * 观众「暂停跟随 / 拖动 / 重播」退回本地回放；结束后（ended）走本地回放（可拖动 / 重播）。
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { flattenFirings } from "@/modules/atlas/collect";
import { LifecycleGraph } from "@/modules/atlas/lifecycle-graph";
import { useAtlasPlayback } from "@/modules/atlas/use-atlas-playback";
import type { AtlasMechanism } from "@/modules/atlas/types";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import { useMediaQuery } from "./use-media-query";
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
  const [follow, setFollow] = useState(true);
  const wide = useMediaQuery("(min-width: 860px)");

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
  const playback = useAtlasPlayback(firings, { stepMs: 450 });
  const { setCursor, setPlaying } = playback;

  const live = room?.status === "live";
  const total = firings.length;
  const serverHead = Math.max(0, Math.min(room?.head ?? total, total));
  const usingFollow = Boolean(live) && follow;

  const lit = useMemo(
    () => (usingFollow ? new Set(firings.slice(0, serverHead)) : playback.lit),
    [usingFollow, firings, serverHead, playback.lit],
  );
  const active = usingFollow ? (serverHead > 0 ? firings[serverHead - 1] : null) : playback.active;
  const revealed = usingFollow ? serverHead : Math.min(playback.cursor + 1, total);
  const sliderValue = usingFollow ? serverHead : playback.cursor;

  // 跟随中停掉本地游标计时（避免无谓重渲染）。
  useEffect(() => {
    if (usingFollow) setPlaying(false);
  }, [usingFollow, setPlaying]);

  // live → ended 且一直跟随：接续到服务端已披露处，不重置回起点。
  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (live) {
      wasLiveRef.current = true;
      return;
    }
    if (wasLiveRef.current && follow) {
      setCursor(Math.max(0, serverHead - 1));
      setPlaying(false);
    }
  }, [live, follow, serverHead, setCursor, setPlaying]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
        {error}（房间 {roomId}）
      </div>
    );
  }
  if (!room) return <p className="text-[13px] text-muted-foreground">正在连接观战房间…</p>;

  const currentLabel = active ? triggerMetaOf(active).title : total ? "已走完" : "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2">
        <Badge variant={live ? "default" : "secondary"}>{live ? (follow ? "实时" : "实时 · 回看") : "已结束"}</Badge>
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

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
        <RosterCard side={room.player} tone="player" />
        <RosterCard side={room.enemy} tone="enemy" />
      </div>

      <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="引擎内部流程（按发生顺序点亮）" bodyClassName="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {usingFollow ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={total === 0}
                onClick={() => {
                  setFollow(false);
                  setCursor(Math.max(0, serverHead - 1));
                  setPlaying(false);
                }}
              >
                暂停跟随
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={total === 0} onClick={() => setPlaying(!playback.playing)}>
                {playback.playing ? "暂停" : "播放"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={total === 0}
              onClick={() => {
                setFollow(false);
                setCursor(0);
                setPlaying(true);
              }}
            >
              重播
            </Button>
            {live ? (
              <Button type="button" size="sm" variant={usingFollow ? "secondary" : "ghost"} disabled={total === 0} onClick={() => setFollow(true)}>
                跟随最新
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={total === 0}
                onClick={() => {
                  setFollow(false);
                  setCursor(Math.max(0, total - 1));
                  setPlaying(false);
                }}
              >
                跳到最新
              </Button>
            )}
            <input
              type="range"
              min={0}
              max={Math.max(total, 1)}
              value={Math.min(sliderValue, total)}
              onChange={(event) => {
                setFollow(false);
                setPlaying(false);
                setCursor(Number(event.target.value));
              }}
              className="h-1 min-w-[120px] flex-1 cursor-pointer accent-primary"
              aria-label="回放进度"
            />
            <span className="text-[11px] text-muted-foreground tnum">
              {total === 0 ? "等待出招" : `第 ${Math.min(Math.max(revealed, 0), total)} / ${total} 步`}
            </span>
            <span className="text-[11px] text-muted-foreground">
              当前：<span className="font-medium text-foreground">{currentLabel}</span>
            </span>
          </div>

          <div className={wide ? undefined : "overflow-x-auto"}>
            <div className={wide ? undefined : "min-w-[820px]"}>
              <LifecycleGraph
                grouped={grouped}
                litTriggers={lit}
                activeTrigger={active}
                layout={wide ? "full" : "compact"}
                containerClassName={wide ? "h-[640px] w-full" : "h-[420px] w-full"}
              />
            </div>
          </div>
        </Panel>

        <Panel title="事件记录" bodyClassName="min-h-0 overflow-y-auto max-h-[440px] min-[1100px]:max-h-none" className="min-h-[320px]">
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
