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
import type { CostMod } from "@/modules/engine/types";
import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import { actionKey, costModBreakdown, elementZh, previewSkillCost, skillById, type ActionOption } from "./util";

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
  cost,
  modifiers,
  cooldown,
  tone,
  winRate,
  rank,
  recommended,
  selected,
  restricted,
  disabled,
  onUse,
  onChangeSlot,
}: {
  catalog: Catalog;
  spriteId: string;
  index: number;
  skillId: string;
  energy: number;
  cost?: number;
  modifiers?: CostMod[];
  cooldown?: number;
  tone: Tone;
  winRate?: number;
  /** 推荐度排名（1 为最优，缺省 = 无推荐数据）。 */
  rank?: number;
  recommended?: boolean;
  selected?: boolean;
  /** 受规则 / 特性限制，当前不可用（如只允许某号位）。 */
  restricted?: boolean;
  disabled?: boolean;
  onUse: (skillId: string) => void;
  onChangeSlot: (index: number, skillId: string) => void;
}) {
  const sk = skillId ? skillById(catalog, skillId) : undefined;
  const effective = sk ? (cost ?? sk.cost) : 0;
  const affordable = sk ? effective <= energy : false;
  const onCooldown = (cooldown ?? 0) > 0;
  const usable = Boolean(sk) && affordable && !disabled && !onCooldown && !restricted;
  const [slotOpen, setSlotOpen] = useState(false);

  return (
    <div
      className={[
        "relative min-w-0 rounded-md border bg-card p-2 transition-all",
        selected
          ? "border-primary bg-accent ring-2 ring-primary ring-offset-1 ring-offset-background"
          : rank === 1
            ? "border-primary/60 bg-primary/5 hover:border-primary/40"
            : "border-border hover:border-primary/40 hover:bg-accent/40",
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
        className={`w-full text-left transition-transform active:scale-[0.98] ${usable ? "" : "cursor-not-allowed"}`}
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
                  {recommended ? (
                    <Badge variant="success" className="shrink-0">推荐</Badge>
                  ) : rank ? (
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">#{rank}</span>
                  ) : null}
                  {selected ? <Badge className="shrink-0">已选</Badge> : null}
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
                    <span
                      title={
                        modifiers?.length
                          ? `基础 ${sk.cost} · ${modifiers.map((m) => `${m.sourceId ?? m.source} ${m.delta ? (m.delta > 0 ? `+${m.delta}` : `${m.delta}`) : ""}${m.multiply ? `×${m.multiply}` : ""}${m.duration === "turns" ? `（${m.turnsLeft ?? 0}回合）` : ""}`).join("；")}`
                          : undefined
                      }
                      className={modifiers?.length ? "cursor-help font-semibold text-amber-600 dark:text-amber-400" : undefined}
                    >
                      能耗 {effective}
                      {modifiers?.length ? <span className="ml-1 text-[10px] opacity-70">(基础 {sk.cost})</span> : null}
                    </span>
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
      {sk && !usable ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-md bg-muted/60 backdrop-grayscale"
          title={onCooldown ? `冷却中：还需等待 ${cooldown} 回合` : restricted ? "受特性 / 规则限制，本回合不可用" : affordable ? undefined : "能量不足"}
        >
          {onCooldown ? (
            <span className="tnum text-3xl font-bold leading-none text-foreground/70">{cooldown}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SkillGrid({
  catalog,
  side,
  rec,
  legalSkillIds,
  tone,
  selectedKey,
  disabled,
  onUse,
  onChangeSlot,
}: {
  catalog: Catalog;
  side: SideState;
  rec: RecommendResult | null;
  legalSkillIds?: Set<string>;
  tone: Tone;
  selectedKey: string | null;
  disabled?: boolean;
  onUse: (skillId: string) => void;
  onChangeSlot: (index: number, skillId: string) => void;
}) {
  // 按 skillId 建索引：`actionKey` 含尾随 choice（`skill:<id>:`），不能直接与 tile 比对。
  const rateById = new Map<string, number>();
  const rankById = new Map<string, number>();
  // 推荐度只在「技能」之间排名（全局最优常是聚能，不代表最推荐的技能）。
  const skillActions = (rec?.actions ?? []).filter((a) => a.action.kind === "skill" && a.action.skillId);
  skillActions.forEach((a, i) => {
    const sid = a.action.skillId as string;
    const prev = rateById.get(sid);
    if (prev === undefined || a.winRate > prev) rateById.set(sid, a.winRate);
    if (!rankById.has(sid)) rankById.set(sid, i + 1);
  });
  const bestSkillId = skillActions[0]?.action.skillId ?? null;
  const isSelected = (id: string) => Boolean(id && selectedKey && selectedKey.startsWith(`skill:${id}:`));
  // 受规则 / 特性限制（如圣剑-X「正位宝剑」只允许 1 号位）而不可用的技能：引擎合法技能集里没有。
  const isRestricted = (id: string) => Boolean(legalSkillIds && id && !legalSkillIds.has(id));
  const loadout = side.active.loadout;

  return (
    <div className="flex flex-col gap-1.5">
      {[0, 1, 2, 3].map((i) => {
        const id = loadout[i] ?? "";
        const sk = id ? skillById(catalog, id) : undefined;
        return (
          <SkillTile
            key={i}
            catalog={catalog}
            spriteId={side.active.spriteId}
            index={i}
            skillId={id}
            energy={side.active.energy}
            cost={sk ? previewSkillCost(sk, side.active) : undefined}
            modifiers={sk ? costModBreakdown(sk, side.active) : undefined}
            cooldown={id ? side.active.cooldowns?.[id] ?? 0 : 0}
            tone={tone}
            winRate={id ? rateById.get(id) : undefined}
            rank={id ? rankById.get(id) : undefined}
            recommended={Boolean(id) && id === bestSkillId}
            selected={isSelected(id)}
            restricted={isRestricted(id)}
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
