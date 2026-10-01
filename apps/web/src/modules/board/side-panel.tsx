"use client";

import { useState } from "react";
import Image from "next/image";

import { ElementIcon } from "@/components/element-icon";
import { SkillCategoryIcon } from "@/components/skill-category-icon";
import { SkillSlotDialog } from "@/components/skill-slot-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import type { Catalog, RecommendResult, SideState } from "@/modules/battle/types";
import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import { actionKey, elementZh, skillById, type ActionOption } from "./util";

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
            <div className="flex items-start gap-2 pr-9">
              {sk.icon ? (
                <Image src={sk.icon} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md border bg-muted object-contain" />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-muted/50">
                  <SkillCategoryIcon skill={sk} size={16} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className={`truncate text-sm font-semibold ${affordable ? "" : "text-muted-foreground"}`}>
                    {sk.name}
                  </span>
                  {recommended && <Badge variant="success">推荐</Badge>}
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-x-1.5">
                    <span className="inline-flex items-center gap-0.5">
                      <ElementIcon catalog={catalog} element={sk.element} size={13} />
                      {elementZh(catalog, sk.element)}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <SkillCategoryIcon skill={sk} size={13} />
                      {sk.categoryZh ?? sk.category}
                    </span>
                  </div>
                  <div className="tnum flex flex-wrap items-center gap-x-1.5">
                    <span>能耗 {sk.cost}</span>
                    {sk.power ? <span>威力 {sk.power}</span> : null}
                    {sk.priority ? <span>先手 +{sk.priority}</span> : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
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
    <div className="flex flex-col gap-1.5">
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
