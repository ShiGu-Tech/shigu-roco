"use client";

import { useState } from "react";
import Image from "next/image";

import { SkillCategoryIcon } from "@/components/skill-category-icon";
import { SkillSlotDialog } from "@/components/skill-slot-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import type { Catalog, RecommendResult, SideState } from "@/modules/battle/types";
import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import { actionKey, skillById, type ActionOption } from "./util";

export type Tone = "player" | "enemy";

export function toneColor(tone: Tone): string {
  return tone === "player" ? PLAYER_COLOR : ENEMY_COLOR;
}

function SkillTile({
  catalog,
  spriteId,
  index,
  skillId,
  energy,
  tone,
  winRate,
  recommended,
  selected,
  disabled,
  onUse,
  onChangeSlot,
}: {
  catalog: Catalog;
  spriteId: string;
  index: number;
  skillId: string;
  energy: number;
  tone: Tone;
  winRate?: number;
  recommended?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onUse: (skillId: string) => void;
  onChangeSlot: (index: number, skillId: string) => void;
}) {
  const sk = skillId ? skillById(catalog, skillId) : undefined;
  const affordable = sk ? sk.cost <= energy : false;
  const usable = Boolean(sk) && affordable && !disabled;
  const color = sk ? catalog.elements.find((e) => e.name === sk.element)?.color : undefined;
  const [slotOpen, setSlotOpen] = useState(false);

  return (
    <div
      className={[
        "relative min-w-0 rounded-md border bg-card p-2 transition-colors",
        selected ? "border-primary bg-accent" : "border-border hover:border-primary/40 hover:bg-accent/40",
        !sk ? "border-dashed" : "",
      ].join(" ")}
    >
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => setSlotOpen(true)}
        className="absolute right-1 top-1 z-10 h-6 px-2 text-[10px]"
      >
        换
      </Button>

      <SkillSlotDialog
        open={slotOpen}
        onOpenChange={setSlotOpen}
        catalog={catalog}
        spriteId={spriteId}
        slotIndex={index}
        value={skillId}
        onSelect={(id) => onChangeSlot(index, id)}
        onClear={() => onChangeSlot(index, "")}
      />

      <button
        type="button"
        disabled={!usable}
        onClick={() => sk && onUse(sk.id)}
        className={`w-full text-left ${usable ? "" : "cursor-not-allowed"}`}
      >
        {sk ? (
          <>
            <div className="flex items-center gap-1 pr-9">
              {sk.icon ? (
                <Image src={sk.icon} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-contain" />
              ) : color ? (
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              ) : null}
              <span className={`truncate text-sm font-semibold ${affordable ? "" : "text-muted-foreground"}`}>
                {sk.name}
              </span>
              {recommended && <Badge variant="success">推荐</Badge>}
            </div>
            <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <SkillCategoryIcon skill={sk} size={14} />
              <span className="truncate">
                {sk.categoryZh ?? sk.category} · 能耗{sk.cost}
                {sk.power ? ` · 威力${sk.power}` : ""}
                {sk.priority ? ` · 先手+${sk.priority}` : ""}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={(winRate ?? 0) * 100} className="flex-1" />
              <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: toneColor(tone) }}>
                {winRate === undefined ? "—" : `${(winRate * 100).toFixed(1)}%`}
              </span>
            </div>
          </>
        ) : (
          <div className="flex min-h-[56px] items-center justify-center text-xs text-muted-foreground">无</div>
        )}
      </button>
    </div>
  );
}

export function SkillGrid({
  catalog,
  side,
  rec,
  tone,
  selectedKey,
  disabled,
  onUse,
  onChangeSlot,
}: {
  catalog: Catalog;
  side: SideState;
  rec: RecommendResult | null;
  tone: Tone;
  selectedKey: string | null;
  disabled?: boolean;
  onUse: (skillId: string) => void;
  onChangeSlot: (index: number, skillId: string) => void;
}) {
  const rate = new Map<string, number>();
  for (const a of rec?.actions ?? []) {
    rate.set(actionKey(a.action), a.winRate);
  }
  const bestKey = rec?.actions[0] ? actionKey(rec.actions[0].action) : null;
  const loadout = side.active.loadout;

  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((i) => {
        const id = loadout[i] ?? "";
        const k = `skill:${id}`;
        return (
          <SkillTile
            key={i}
            catalog={catalog}
            spriteId={side.active.spriteId}
            index={i}
            skillId={id}
            energy={side.active.energy}
            tone={tone}
            winRate={id ? rate.get(k) : undefined}
            recommended={id ? k === bestKey : false}
            selected={id ? k === selectedKey : false}
            disabled={disabled}
            onUse={onUse}
            onChangeSlot={onChangeSlot}
          />
        );
      })}
    </div>
  );
}

export function OtherActions({
  options,
  rec,
  tone,
  selectedKey,
  disabled,
  onUse,
}: {
  options: ActionOption[];
  rec: RecommendResult | null;
  tone: Tone;
  selectedKey: string | null;
  disabled?: boolean;
  onUse: (option: ActionOption) => void;
}) {
  const rate = new Map<string, number>();
  for (const a of rec?.actions ?? []) {
    rate.set(actionKey(a.action), a.winRate);
  }
  const bestKey = rec?.actions[0] ? actionKey(rec.actions[0].action) : null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.length === 0 && <p className="text-xs text-muted-foreground">无其他可用动作。</p>}
      {options.map((o) => {
        const k = actionKey(o.action);
        const winRate = rate.get(k);
        return (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={k === selectedKey ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onUse(o)}
            className="justify-between gap-2"
          >
            <span>
              {o.label}
              {o.kindLabel ? <span className="ml-1 text-[10px] opacity-70">{o.kindLabel}</span> : null}
            </span>
            <span className="tabular-nums font-semibold" style={{ color: toneColor(tone) }}>
              {k === bestKey && <span className="mr-1 text-[10px]">★</span>}
              {winRate === undefined ? "—" : `${(winRate * 100).toFixed(1)}%`}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
