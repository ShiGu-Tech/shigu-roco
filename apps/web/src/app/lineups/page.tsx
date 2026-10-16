"use client";

import { Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/page-header";
import { SpriteImage } from "@/components/sprite-image";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { Catalog } from "@/modules/battle/types";
import { getCatalog } from "@/modules/battle/client";
import { deleteLineup, listLineups, type Lineup } from "@/modules/board/lineups";
import { spriteOf } from "@/modules/board/util";
import { toast } from "sonner";

import { LineupDetailDialog } from "@/modules/board/lineup-library";

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function Group({
  title,
  tone,
  lineups,
  catalog,
  selectedId,
  onSelect,
  onView,
  onDelete,
}: {
  title: string;
  tone: "player" | "enemy";
  lineups: Lineup[];
  catalog: Catalog | null;
  selectedId: string | null;
  onSelect: (lineup: Lineup) => void;
  onView: (lineup: Lineup) => void;
  onDelete: (lineup: Lineup) => void;
}) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("text-[13px] font-semibold", tone === "player" ? "text-[var(--player)]" : "text-[var(--enemy)]")}>{title}</span>
        <span className="tnum text-[11px] text-muted-foreground">{lineups.length} 套</span>
      </div>
      {lineups.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">还没有。首页输入截图 / 口述 / 打字就能建一套。</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {lineups.map((lineup) => (
            <div
              key={lineup.id}
              className={cn("rounded-md border p-2", selectedId === lineup.id ? "border-primary bg-accent/60" : "")}
            >
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => onSelect(lineup)}>
                <span className="flex shrink-0 -space-x-1">
                  {lineup.entries.slice(0, 6).map((entry, index) => (
                    <SpriteImage
                      key={`${entry.spriteId}-${index}`}
                      sprite={catalog ? spriteOf(catalog, entry.spriteId) : undefined}
                      size="sm"
                      className="h-7 w-7 rounded-sm"
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{lineup.name}</span>
                  <span className="tnum text-[10px] text-muted-foreground">
                    {lineup.entries.length} 只 · {formatTime(lineup.updatedAt)}
                  </span>
                </span>
                {selectedId === lineup.id ? <span className="text-[10px] text-primary">已选</span> : null}
              </button>
              <div className="mt-1.5 flex gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => onView(lineup)}>
                  详情
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(lineup)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 队伍列表：我方 / 对方两栏，各选一套即可开战。 */
export default function LineupsPage() {
  const router = useRouter();
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [player, setPlayer] = React.useState<Lineup[]>([]);
  const [enemy, setEnemy] = React.useState<Lineup[]>([]);
  const [playerId, setPlayerId] = React.useState<string | null>(null);
  const [enemyId, setEnemyId] = React.useState<string | null>(null);
  const [viewLineup, setViewLineup] = React.useState<Lineup | null>(null);

  const reload = React.useCallback(() => {
    setPlayer(listLineups("player"));
    setEnemy(listLineups("enemy"));
  }, []);

  React.useEffect(() => {
    let alive = true;
    getCatalog()
      .then((next) => {
        if (!alive) return;
        setCatalog(next);
        reload();
      })
      .catch(() => {
        if (alive) toast.error("引擎数据加载失败，请刷新重试");
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  function start() {
    if (!playerId || !enemyId) return;
    router.push(`/board?player=${encodeURIComponent(playerId)}&enemy=${encodeURIComponent(enemyId)}`);
  }

  return (
    <>
      <PageHeader title="队伍列表" description="我方与对方各选一套，直接进对战台开战；队伍由首页识别 / 手建后保存。" />
      <div className="grid gap-2 min-[520px]:grid-cols-2">
        <Group
          title="我方队伍"
          tone="player"
          lineups={player}
          catalog={catalog}
          selectedId={playerId}
          onSelect={(lineup) => setPlayerId((current) => (current === lineup.id ? null : lineup.id))}
          onView={setViewLineup}
          onDelete={(lineup) => {
            deleteLineup(lineup.id);
            if (playerId === lineup.id) setPlayerId(null);
            reload();
          }}
        />
        <Group
          title="对方队伍"
          tone="enemy"
          lineups={enemy}
          catalog={catalog}
          selectedId={enemyId}
          onSelect={(lineup) => setEnemyId((current) => (current === lineup.id ? null : lineup.id))}
          onView={setViewLineup}
          onDelete={(lineup) => {
            deleteLineup(lineup.id);
            if (enemyId === lineup.id) setEnemyId(null);
            reload();
          }}
        />
      </div>
      <div className="sticky bottom-2 mt-3 flex items-center gap-2 rounded-md border bg-card/95 p-2 backdrop-blur">
        <Button type="button" className="h-11 flex-1" disabled={!playerId || !enemyId} onClick={start}>
          <Swords className="mr-2 h-4 w-4" />
          {playerId && enemyId ? "进入对战台" : "我方、对方各选一套"}
        </Button>
      </div>
      {catalog ? (
        <LineupDetailDialog open={viewLineup !== null} onOpenChange={(open) => (!open ? setViewLineup(null) : undefined)} catalog={catalog} lineup={viewLineup} />
      ) : null}
    </>
  );
}
