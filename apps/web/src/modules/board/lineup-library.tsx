"use client";

import { PetDetailCard } from "@/components/pet-detail-card";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "cn";
import type { ActiveSpriteState, Catalog } from "@/modules/battle/types";
import { profileFromSetup } from "@/modules/battle/pet";
import type { Lineup } from "./lineups";
import { spriteOf } from "./util";

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** 阵容条目 → 详情卡用的运行态（无血量，只带资质与技能）。 */
function activeOf(entry: Lineup["entries"][number]): ActiveSpriteState {
  return {
    spriteId: entry.spriteId,
    hp: 0,
    maxHp: 0,
    energy: 0,
    loadout: entry.setup?.skills ?? [],
    buffs: {},
    debuffs: {},
    marks: {},
    statuses: {},
    profile: profileFromSetup(entry.setup),
  };
}

/** 队伍详情弹窗：逐只列出精灵的资质面板与技能。 */
export function LineupDetailDialog({
  open,
  onOpenChange,
  catalog,
  lineup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  lineup: Lineup | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base">{lineup?.name ?? "队伍详情"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          {!lineup || lineup.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">该队伍没有精灵。</p>
          ) : (
            lineup.entries.map((entry, i) => (
              <div key={`${entry.spriteId}-${i}`} className="rounded-md border bg-card">
                <PetDetailCard
                  catalog={catalog}
                  sprite={spriteOf(catalog, entry.spriteId)}
                  active={activeOf(entry)}
                  headline={`第 ${i + 1} 只${i === 0 ? " · 首发" : ""}`}
                />
              </div>
            ))
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** 阵容库列表：卡片可勾选（最多 2 套）、查看详情、编辑、删除。 */
export function LineupLibrary({
  catalog,
  lineups,
  selectedIds,
  onToggle,
  onView,
  onEdit,
  onDelete,
}: {
  catalog: Catalog;
  lineups: Lineup[];
  selectedIds: string[];
  onToggle: (lineup: Lineup) => void;
  onView: (lineup: Lineup) => void;
  onEdit: (lineup: Lineup) => void;
  onDelete: (lineup: Lineup) => void;
}) {
  if (lineups.length === 0) {
    return <p className="text-[12px] text-muted-foreground">还没有保存的阵容，点右上「新建 / 配队」开始。</p>;
  }

  return (
    <div className="space-y-2">
      {lineups.map((lineup) => {
        const selected = selectedIds.includes(lineup.id);
        const order = selectedIds.indexOf(lineup.id);
        return (
          <div
            key={lineup.id}
            className={cn("rounded-md border p-2 transition-colors", selected ? "border-primary bg-accent" : "")}
          >
            <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center">
              <button
                type="button"
                onClick={() => onToggle(lineup)}
                aria-pressed={selected}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
                  )}
                >
                  {selected ? order + 1 : "•"}
                </span>
                <span className="flex shrink-0 -space-x-1">
                  {lineup.entries.slice(0, 6).map((entry, i) => (
                    <SpriteImage
                      key={`${entry.spriteId}-${i}`}
                      sprite={spriteOf(catalog, entry.spriteId)}
                      size="sm"
                      className="h-8 w-8 rounded-sm"
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{lineup.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="tnum">{lineup.entries.length} 只</Badge>
                    {lineup.entries.some((e) => e.setup) && <Badge variant="outline">含资质</Badge>}
                    <span>更新 {formatTime(lineup.updatedAt)}</span>
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => onView(lineup)}>
                  详情
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onEdit(lineup)}>
                  编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(lineup)}
                >
                  删除
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
