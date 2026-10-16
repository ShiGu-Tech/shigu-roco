"use client";

import { ArrowLeftRight, Camera, Images, Loader2, Mic, Search, Send, Sparkles, Swords, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { SpriteImage } from "@/components/sprite-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import { cn } from "cn";
import type { Catalog, CatalogSprite } from "@/modules/battle/types";
import { getCatalog } from "@/modules/battle/client";
import type { TeamEntry } from "@/modules/battle/pet";
import { saveLineup } from "@/modules/board/lineups";
import { emptySetup, spriteOf } from "@/modules/board/util";
import { listPets } from "@/modules/pets/store";
import { toast } from "sonner";

type Side = "player" | "enemy";
const TEAM_SIZE = 6;

interface Picked {
  spriteId: string;
  name: string;
  source: "photo" | "voice" | "text" | "manual" | "warehouse";
}

interface Candidate {
  id: string;
  name: string;
  confidence: number;
  image?: string;
  head?: string;
}

interface IngestSegment {
  text: string;
  candidates: Candidate[];
}

interface IngestResult {
  player: IngestSegment[];
  enemy: IngestSegment[];
  unknown: IngestSegment[];
  unmatched: string[];
  text: string;
  source: "text" | "photo" | "voice";
}

type Slots = { player: (Picked | null)[]; enemy: (Picked | null)[] };

const emptySlots = (): Slots => ({
  player: Array.from({ length: TEAM_SIZE }, () => null),
  enemy: Array.from({ length: TEAM_SIZE }, () => null),
});

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 canvas");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取音频失败"));
    reader.readAsDataURL(blob);
  });
}

/** 一列 6 格：点空格 / 点已填格都能换人。 */
function SideColumn({
  side,
  slots,
  catalog,
  onPick,
  onClear,
  onMove,
}: {
  side: Side;
  slots: (Picked | null)[];
  catalog: Catalog | null;
  onPick: (index: number) => void;
  onClear: (index: number) => void;
  onMove: (index: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-0.5">
        <span className={cn("h-2 w-2 rounded-full", side === "player" ? "bg-side-player" : "bg-side-enemy")} />
        <span className={cn("text-[13px] font-semibold", side === "player" ? "text-side-player" : "text-side-enemy")}>
          {side === "player" ? "我方" : "对方"}
        </span>
        <span className="tnum text-[11px] text-muted-foreground">{slots.filter(Boolean).length}/{TEAM_SIZE}</span>
      </div>
      <div className="space-y-1.5">
        {slots.map((pet, index) => (
          <div
            key={index}
            className={cn(
              "group relative flex items-center gap-1.5 overflow-hidden rounded-xl border-2 p-1.5 transition-all",
              pet
                ? side === "player"
                  ? "border-side-player/35 bg-gradient-to-r from-side-player/12 to-transparent shadow-[0_1px_0_0_var(--border)]"
                  : "border-side-enemy/35 bg-gradient-to-r from-side-enemy/12 to-transparent shadow-[0_1px_0_0_var(--border)]"
                : "border-dashed border-border/70 bg-card/50 hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums",
                pet
                  ? side === "player"
                    ? "bg-side-player/15 text-side-player"
                    : "bg-side-enemy/15 text-side-enemy"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left active:scale-[0.98]" onClick={() => onPick(index)}>
              {pet ? (
                <>
                  <SpriteImage sprite={catalog ? spriteOf(catalog, pet.spriteId) : undefined} size="sm" className="h-10 w-10 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{pet.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {pet.source === "photo" ? "拍照" : pet.source === "voice" ? "口述" : pet.source === "text" ? "打字" : pet.source === "warehouse" ? "仓库" : "手选"}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-dashed text-muted-foreground/70">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">点这换人</span>
                </>
              )}
            </button>
            {pet ? (
              <span className="flex shrink-0 flex-col gap-0.5 pr-0.5">
                <button type="button" aria-label="换到对面" onClick={() => onMove(index)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="清空" onClick={() => onClear(index)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 选精灵面板：搜索图鉴 + 从精灵仓库挑。 */
function SlotPicker({
  open,
  onOpenChange,
  catalog,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog | null;
  onSelect: (sprite: CatalogSprite, source: Picked["source"]) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"catalog" | "warehouse">("warehouse");
  const pets = React.useMemo(() => (open ? listPets() : []), [open]);

  const sprites = React.useMemo(() => {
    if (!catalog) return [];
    const all = Object.values(catalog.sprites);
    const needle = query.trim();
    const filtered = needle ? all.filter((sprite) => String(sprite.nameZh ?? "").includes(needle) || String(sprite.id).includes(needle)) : all;
    return filtered.slice(0, 48);
  }, [catalog, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogSheet aria-describedby={undefined}>
        <DialogHeader className="py-2.5">
          <DialogTitle className="text-sm font-semibold tracking-tight">选精灵</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2 p-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setTab("warehouse")}
              className={cn("h-9 flex-1 rounded-md border text-[12px]", tab === "warehouse" ? "border-primary bg-accent font-medium" : "text-muted-foreground")}
            >
              精灵仓库（{pets.length}）
            </button>
            <button
              type="button"
              onClick={() => setTab("catalog")}
              className={cn("h-9 flex-1 rounded-md border text-[12px]", tab === "catalog" ? "border-primary bg-accent font-medium" : "text-muted-foreground")}
            >
              图鉴全量
            </button>
          </div>

          {tab === "catalog" ? (
            <label className="flex h-10 items-center gap-2 rounded-md border px-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜名字（如 迪莫）"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          ) : null}

          {tab === "warehouse" ? (
            pets.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">仓库是空的：去「精灵仓库」把你练好的精灵录进去，这里就能一键挑。</p>
            ) : (
              <div className="grid max-h-[42vh] grid-cols-3 gap-1.5 overflow-y-auto min-[520px]:grid-cols-4">
                {pets.map((pet) => {
                  const sprite = catalog ? spriteOf(catalog, pet.spriteId) : undefined;
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => sprite && onSelect(sprite, "warehouse")}
                      className="flex flex-col items-center gap-1 rounded-lg border p-1.5 active:scale-95"
                    >
                      <SpriteImage sprite={sprite} size="sm" className="h-12 w-12 rounded-lg" />
                      <span className="w-full truncate text-center text-[10px]">{sprite?.nameZh ?? pet.spriteId}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid max-h-[42vh] grid-cols-3 gap-1.5 overflow-y-auto min-[520px]:grid-cols-4">
              {sprites.map((sprite) => (
                <button
                  key={String(sprite.id)}
                  type="button"
                  onClick={() => onSelect(sprite, "manual")}
                  className="flex flex-col items-center gap-1 rounded-lg border p-1.5 active:scale-95"
                >
                  <SpriteImage sprite={sprite} size="sm" className="h-12 w-12 rounded-lg" />
                  <span className="w-full truncate text-center text-[10px]">{sprite.nameZh}</span>
                </button>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter className="justify-end">
          <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogSheet>
    </Dialog>
  );
}

/** 首页＝布阵：左侧我方 6 格、右侧对方 6 格，点格子换人；底部输入框支持图片 / 语音 / 打字。 */
export function Composer() {
  const router = useRouter();
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [slots, setSlots] = React.useState<Slots>(emptySlots);
  const [picker, setPicker] = React.useState<{ side: Side; index: number } | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState<IngestSegment[]>([]);
  const [rawText, setRawText] = React.useState("");
  const [unmatched, setUnmatched] = React.useState<string[]>([]);
  const [recording, setRecording] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  React.useEffect(() => {
    let alive = true;
    getCatalog()
      .then((next) => {
        if (alive) setCatalog(next);
      })
      .catch(() => {
        if (alive) toast.error("引擎数据加载失败，请刷新重试");
      });
    return () => {
      alive = false;
    };
  }, []);

  const canRecord =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  function fill(side: Side, picks: Picked[]) {
    setSlots((current) => {
      const next: Slots = { player: [...current.player], enemy: [...current.enemy] };
      for (const pet of picks) {
        if (next[side].some((item) => item?.spriteId === pet.spriteId)) continue;
        const index = next[side].findIndex((item) => item === null);
        if (index < 0) break;
        next[side][index] = pet;
      }
      return next;
    });
  }

  async function ingest(path: "text" | "photo" | "voice", body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ingest/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<IngestResult> & { message?: string };
      if (!response.ok) {
        setError(payload.message ?? `识别失败（${response.status}）`);
        return;
      }
      const result = payload as IngestResult;
      const sourceKind: Picked["source"] = result.source === "photo" ? "photo" : result.source === "voice" ? "voice" : "text";
      const toPicks = (segments: IngestSegment[]): Picked[] =>
        segments
          .map((segment) => segment.candidates[0])
          .filter((candidate): candidate is Candidate => Boolean(candidate))
          .map((candidate) => ({ spriteId: candidate.id, name: candidate.name, source: sourceKind }));
      const playerPicks = toPicks(result.player);
      const enemyPicks = toPicks(result.enemy);
      if (playerPicks.length > 0) fill("player", playerPicks);
      if (enemyPicks.length > 0) fill("enemy", enemyPicks);
      setPending(result.unknown ?? []);
      setUnmatched(result.unmatched ?? []);
      setRawText(result.text ?? "");
      const total = playerPicks.length + enemyPicks.length + (result.unknown?.length ?? 0);
      if (total === 0) setError("没识别到精灵名，换个方式或重试");
      else toast.success(`识别到 ${total} 个名称`);
      setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "识别失败");
    } finally {
      setBusy(false);
    }
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await ingest("photo", { image: await compressImage(file) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图片处理失败");
      setBusy(false);
    }
  }

  async function onRecordToggle() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setError("没有录到声音");
          return;
        }
        await ingest("voice", { audio: await blobToDataUrl(blob), mime: blob.type || "audio/webm" });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError("");
    } catch {
      setError("拿不到麦克风（需要 HTTPS 或授权），可以改用打字");
    }
  }

  function assignPending(index: number, side: Side) {
    const segment = pending[index];
    const top = segment?.candidates[0];
    if (top) fill(side, [{ spriteId: top.id, name: top.name, source: "text" }]);
    setPending((list) => list.filter((_, i) => i !== index));
  }

  const ready = slots.player.some(Boolean) && slots.enemy.some(Boolean);

  function start() {
    const stamp = new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const toPlayer = (list: (Picked | null)[]): TeamEntry[] =>
      list.filter((item): item is Picked => Boolean(item)).map((item) => ({ spriteId: item.spriteId, setup: emptySetup() }));
    const toEnemy = (list: (Picked | null)[]): TeamEntry[] =>
      list.filter((item): item is Picked => Boolean(item)).map((item) => ({ spriteId: item.spriteId, skillsUnknown: true }));
    const playerName = `我方 · ${stamp}`;
    const enemyName = `对方 · ${stamp}`;
    const playerLineups = saveLineup("player", playerName, toPlayer(slots.player));
    const enemyLineups = saveLineup("enemy", enemyName, toEnemy(slots.enemy));
    const query = new URLSearchParams();
    const playerId = playerLineups.find((item) => item.name === playerName)?.id;
    const enemyId = enemyLineups.find((item) => item.name === enemyName)?.id;
    if (playerId) query.set("player", playerId);
    if (enemyId) query.set("enemy", enemyId);
    toast.success("阵容已保存，进入对战");
    router.push(`/board${query.size > 0 ? `?${query.toString()}` : ""}`);
  }

  return (
    <div className="space-y-3 pb-2">
      {/* 标题：活泼一点的渐变条 */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-side-player/12 via-card to-side-enemy/12 p-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-side-player/15 text-side-player">
            <Swords className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight min-[860px]:text-lg">布阵 · PVP</h1>
            <p className="text-[11px] leading-4 text-muted-foreground">左边我方、右边对方；点格子换人，底部拍照/截图/口述/打字直接生成阵容。</p>
          </div>
        </div>
      </div>

      {/* 识别原文（回放你输入/识别出来的原话，便于核对） */}
      {rawText && (pending.length > 0 || slots.player.some(Boolean) || slots.enemy.some(Boolean) || unmatched.length > 0) ? (
        <p className="rounded-xl border bg-card p-2 text-[11px] text-muted-foreground">
          识别原文：<span className="text-foreground">{rawText}</span>
        </p>
      ) : null}

      {/* 识别出来但没标侧别的名称 → 放在最上面，一眼就看到，可一键归边 */}
      {pending.length > 0 ? (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[12px] font-semibold">
              识别到 {pending.length} 只，归哪边？
            </p>
            <button
              type="button"
              className="ml-auto rounded-md border bg-card px-2 py-1 text-[11px]"
              onClick={() => {
                for (let i = pending.length - 1; i >= 0; i -= 1) assignPending(i, "player");
              }}
            >
              全归我方
            </button>
            <button
              type="button"
              className="rounded-md border bg-card px-2 py-1 text-[11px]"
              onClick={() => {
                for (let i = pending.length - 1; i >= 0; i -= 1) assignPending(i, "enemy");
              }}
            >
              全归对方
            </button>
          </div>
          <div className="space-y-1.5">
            {pending.map((segment, index) => (
              <div key={`${segment.text}-${index}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  「{segment.text}」→ <span className="font-medium">{segment.candidates[0]?.name ?? "未匹配"}</span>
                </span>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => assignPending(index, "player")}>
                  我方
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => assignPending(index, "enemy")}>
                  对方
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 布阵对位：左我方 / 右对方，中间一条分隔线 */}
      <div className="relative grid grid-cols-2 gap-3">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-border to-transparent"
        />
        <SideColumn
          side="player"
          slots={slots.player}
          catalog={catalog}
          onPick={(index) => setPicker({ side: "player", index })}
          onClear={(index) => setSlots((current) => ({ ...current, player: current.player.map((item, i) => (i === index ? null : item)) }))}
          onMove={(index) => {
            const pet = slots.player[index];
            if (!pet) return;
            fill("enemy", [{ ...pet }]);
            setSlots((current) => ({ ...current, player: current.player.map((item, i) => (i === index ? null : item)) }));
          }}
        />
        <SideColumn
          side="enemy"
          slots={slots.enemy}
          catalog={catalog}
          onPick={(index) => setPicker({ side: "enemy", index })}
          onClear={(index) => setSlots((current) => ({ ...current, enemy: current.enemy.map((item, i) => (i === index ? null : item)) }))}
          onMove={(index) => {
            const pet = slots.enemy[index];
            if (!pet) return;
            fill("player", [{ ...pet }]);
            setSlots((current) => ({ ...current, enemy: current.enemy.map((item, i) => (i === index ? null : item)) }));
          }}
        />
      </div>

      {/* 两侧对调的常用动作（看完双方一眼再点） */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => setSlots((current) => ({ player: current.enemy, enemy: current.player }))}
          disabled={!slots.player.some(Boolean) && !slots.enemy.some(Boolean)}
          className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          一键对调阵容
        </button>
      </div>

      {/* 识别出来但没标侧别的名称 → 点一下落位 */}
      {pending.length > 0 ? (
        <div className="rounded-2xl border border-dashed p-2.5">
          <p className="mb-2 text-[12px] font-medium">这些归哪边？</p>
          <div className="space-y-1.5">
            {pending.map((segment, index) => (
              <div key={`${segment.text}-${index}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  「{segment.text}」→ {segment.candidates[0]?.name ?? "未匹配"}
                </span>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => assignPending(index, "player")}>
                  我方
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => assignPending(index, "enemy")}>
                  对方
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-xl border border-dashed p-2 text-[12px] text-muted-foreground">{error}</p> : null}
      {unmatched.length > 0 ? (
        <p className="rounded-xl border border-dashed border-warning/60 bg-warning/5 p-2 text-[11px]">
          图鉴里没有这些名字：<span className="font-medium">{unmatched.join("、")}</span> —— 可能是**改过的昵称**，可以点上面的格子手动指定。
        </p>
      ) : null}

      {/* 底部输入框（手机吸底） */}
      <div className="sticky bottom-0 -mx-3 space-y-2 border-t bg-background/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur min-[860px]:-mx-8 min-[860px]:px-8">
        {ready ? (
          <Button type="button" className="h-12 w-full text-[14px]" onClick={start}>
            <Swords className="mr-2 h-4 w-4" />
            进入对战（我方 {slots.player.filter(Boolean).length} / 对方 {slots.enemy.filter(Boolean).length}）
          </Button>
        ) : null}
        <div className="flex items-end gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl border bg-card px-2 py-1.5">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // 手机上回车即发送（Shift+Enter 换行）——否则"打完字按回车没反应"很像"没识别到"
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (text.trim() && !busy) void ingest("text", { text });
                }
              }}
              rows={1}
              placeholder="写名字，如：我方 迪莫、音速犬 对方 锥尾羊"
              className="max-h-24 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm outline-none"
            />
            <label className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-accent">
              <Camera className="h-4 w-4" />
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void onImage(event.target.files?.[0])} />
            </label>
            <label className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-accent">
              <Images className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={(event) => void onImage(event.target.files?.[0])} />
            </label>
            <button
              type="button"
              onClick={() => void onRecordToggle()}
              disabled={busy}
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors",
                recording ? "bg-side-player text-white" : "text-muted-foreground hover:bg-accent",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
          <Button
            type="button"
            className="h-11 w-11 shrink-0 rounded-full p-0"
            disabled={busy || !text.trim()}
            onClick={() => void ingest("text", { text })}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {!canRecord ? <p className="text-[10px] text-muted-foreground">口述需要 HTTPS（线上站点可用）；本地 http 调试可先用打字。</p> : null}
      </div>

      {picker ? (
        <SlotPicker
          open
          onOpenChange={(open) => (!open ? setPicker(null) : undefined)}
          catalog={catalog}
          onSelect={(sprite, source) => {
            const pet: Picked = { spriteId: String(sprite.id), name: String(sprite.nameZh ?? ""), source };
            setSlots((current) => ({ ...current, [picker.side]: current[picker.side].map((item, i) => (i === picker.index ? pet : item)) }));
            setPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
