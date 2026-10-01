"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import type { Catalog } from "@/modules/battle/types";
import { ActiveBoard } from "@/modules/board/active-board";
import { describeEvent } from "@/modules/board/log";
import { TrendChart } from "@/modules/board/trend-chart";

import { deleteReplay, exportBundle, getReplayCatalog, importBundle, listReplays, renameReplay } from "./storage";
import type { Replay } from "./types";

const SPEEDS = [0.5, 1, 2] as const;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stampName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

function winnerLabel(r: Replay): string {
  if (r.winner === "player") return "我方胜";
  if (r.winner === "enemy") return "敌方胜";
  return "未分胜负";
}

// ---------------------------------------------------------------- 列表

export function ReplayView() {
  const [replays, setReplays] = useState<Replay[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Replay | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 挂载后从 localStorage（外部存储）同步记录列表。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplays(listReplays());
  }, []);

  const selected = useMemo(
    () => (selectedId && replays ? replays.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, replays],
  );

  if (selected) {
    return <ReplayPlayer replay={selected} onBack={() => setSelectedId(null)} />;
  }

  if (replays === null) {
    return <p className="text-[13px] text-muted-foreground">正在读取本地对战记录…</p>;
  }

  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const res = importBundle(raw);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setReplays(listReplays());
      toast.success(`已导入 ${res.added} 条${res.skipped ? `，跳过重复 ${res.skipped} 条` : ""}`);
    } catch {
      toast.error("读取文件失败：不是有效的 JSON");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={replays.length === 0}
          onClick={() => downloadJson(`对战记录-${stampName(new Date().toISOString().slice(0, 10))}.json`, exportBundle())}
        >
          导出全部
        </Button>
        <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
          导入
        </Button>
        <span className="text-[11px] text-muted-foreground">
          导入 / 导出为 JSON 文件（含当时图鉴快照），可离线备份、换设备或分享
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {replays.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-[13px] text-muted-foreground">
          还没有对战记录。到「对战台」打一局，点右上角「保存记录」即可在此离线回放；也可用上方「导入」载入记录文件。
        </div>
      )}

      {replays.map((r) => (
        <div key={r.id} className="rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[13px] font-semibold">{r.name}</span>
                <Badge variant={r.winner === "player" ? "default" : r.winner === "enemy" ? "secondary" : "outline"}>
                  {winnerLabel(r)}
                </Badge>
                <Badge variant="outline" className="tnum">第 {r.turns} 回合</Badge>
              </div>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">
                我方 {r.playerLabel} <span className="px-1">vs</span> 敌方 {r.enemyLabel}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatTime(r.createdAt)}
                {r.reason ? ` · ${r.reason}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" onClick={() => setSelectedId(r.id)}>
                回放
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => downloadJson(`对战记录-${stampName(r.name)}.json`, exportBundle([r.id]))}
              >
                导出
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRenaming(r);
                  setRenameText(r.name);
                }}
              >
                重命名
              </Button>
              {confirmId === r.id ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      deleteReplay(r.id);
                      setConfirmId(null);
                      setReplays(listReplays());
                      toast.success("已删除记录");
                    }}
                  >
                    确认删除
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                    取消
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmId(r.id)}>
                  删除
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>重命名对战记录</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input value={renameText} onChange={(e) => setRenameText(e.target.value)} placeholder="记录名称" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!renaming) return;
                renameReplay(renaming.id, renameText);
                setRenaming(null);
                setReplays(listReplays());
                toast.success("已重命名");
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- 回放

function ReplayPlayer({ replay, onBack }: { replay: Replay; onBack: () => void }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const snap = getReplayCatalog(replay.catalogKey);
    // 从 localStorage（外部存储）读取快照，属挂载后同步外部状态。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (snap) setCatalog(snap.catalog);
    else setMissing(true);
  }, [replay.catalogKey]);

  const lastIndex = replay.frames.length - 1;
  useEffect(() => {
    if (!playing || cursor >= lastIndex) return;
    const timer = setTimeout(() => {
      setCursor((c) => Math.min(c + 1, lastIndex));
      if (cursor >= lastIndex - 1) setPlaying(false);
    }, 1100 / speed);
    return () => clearTimeout(timer);
  }, [playing, cursor, speed, lastIndex]);

  if (missing) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          返回列表
        </Button>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-[13px] text-destructive">
          找不到这条记录对应的图鉴快照，无法回放（可能已被清理）。
        </div>
      </div>
    );
  }

  if (!catalog) {
    return <p className="text-[13px] text-muted-foreground">正在读取图鉴快照…</p>;
  }

  const frame = replay.frames[cursor];
  const maxMagic = Number(
    (catalog.rules as { magicMax?: number; magic?: { maxPerSide?: number } }).magicMax ??
      (catalog.rules as { magic?: { maxPerSide?: number } }).magic?.maxPerSide ??
      4,
  );
  const playerFainted = frame.state.player.active.hp <= 0 && frame.state.player.bench.some((b) => b.hp > 0);
  const enemyFainted = frame.state.enemy.active.hp <= 0 && frame.state.enemy.bench.some((b) => b.hp > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-md border bg-card p-2 min-[520px]:flex-row min-[520px]:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            返回列表
          </Button>
          <span className="truncate text-[13px] font-semibold">{replay.name}</span>
          <Badge variant="outline" className="tnum">第 {frame.turn} 回合</Badge>
          <Badge variant="outline">数据版本 {replay.catalogKey.split("@")[0]}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 min-[520px]:ml-auto">
          <Button type="button" size="sm" variant="outline" disabled={cursor <= 0} onClick={() => setCursor((c) => Math.max(0, c - 1))}>
            上一帧
          </Button>
          <Button type="button" size="sm" onClick={() => setPlaying((p) => !p)} disabled={cursor >= replay.frames.length - 1}>
            {playing ? "暂停" : "播放"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={cursor >= replay.frames.length - 1}
            onClick={() => setCursor((c) => Math.min(replay.frames.length - 1, c + 1))}
          >
            下一帧
          </Button>
          <span className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <Button key={s} type="button" size="sm" variant={speed === s ? "default" : "outline"} onClick={() => setSpeed(s)}>
                {s}×
              </Button>
            ))}
          </span>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {replay.frames.map((f, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setPlaying(false);
              setCursor(i);
            }}
            title={f.label}
            className={
              "shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors " +
              (i === cursor
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-accent")
            }
          >
            <span className="tnum font-medium">回合 {f.turn}</span>
          </button>
        ))}
      </div>

      {frame.terminal?.ended && (
        <div className="rounded-md border border-primary/50 bg-primary/5 px-3 py-2 text-[13px] font-medium">
          对局结束：{frame.terminal.winner === "player" ? "我方" : "敌方"}胜 · {frame.terminal.reason}
        </div>
      )}

      <div className="grid gap-3 min-[860px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <div className="order-1 min-w-0">
          <ActiveBoard
            catalog={catalog}
            side={frame.state.player}
            tone="player"
            title="我方场上"
            maxMagic={maxMagic}
            rec={null}
            selectedKey={null}
            selectedBenchId={null}
            disabled
            benchDisabled
            fainted={playerFainted}
            otherOptions={[]}
            onUseSkill={() => {}}
            onChangeSlot={() => {}}
            onUseOther={() => {}}
            onPickBench={() => {}}
          />
        </div>

        <div className="order-3 flex min-w-0 flex-col gap-3 min-[860px]:order-2">
          <Panel title="胜率走势">
            <TrendChart history={frame.history} />
          </Panel>
          <Panel title={`本回合事件（第 ${frame.turn} 回合）`} bodyClassName="p-0">
            <div className="max-h-[380px] overflow-y-auto">
              {frame.log.length === 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground">回合开始前的初始局面。</p>}
              {frame.log.map((e, i) => (
                <div key={i} className="flex items-start gap-2 border-b px-3 py-1.5 text-[12px] last:border-0">
                  <span
                    className="mt-[3px] shrink-0 text-[10px] leading-none"
                    style={{
                      color: e.side === "player" ? PLAYER_COLOR : e.side === "enemy" ? ENEMY_COLOR : "var(--muted-foreground)",
                    }}
                  >
                    ●
                  </span>
                  <span>{describeEvent(e, catalog)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="order-2 min-w-0 min-[860px]:order-3">
          <ActiveBoard
            catalog={catalog}
            side={frame.state.enemy}
            tone="enemy"
            title="敌方场上"
            maxMagic={maxMagic}
            rec={null}
            selectedKey={null}
            selectedBenchId={null}
            disabled
            benchDisabled
            fainted={enemyFainted}
            otherOptions={[]}
            onUseSkill={() => {}}
            onChangeSlot={() => {}}
            onUseOther={() => {}}
            onPickBench={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
