"use client";

import { ElementBadge } from "@/components/element-icon";
import { PetHoverCard } from "@/components/pet-hover-card";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";

import { computeStats } from "@/modules/engine/stats";
import type { ActiveSpriteState, Catalog, RecommendResult, SideState } from "@/modules/battle/types";
import { OtherActions, SkillGrid, toneColor, type Tone } from "./side-panel";
import { spriteOf, type ActionOption } from "./util";

function MagicHearts({ magic, max, tone }: { magic: number; max: number; tone: Tone }) {
  const total = Math.max(1, max);
  const color = toneColor(tone);
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-medium">魔力</span>
      <span className="flex items-center gap-1.5">
        <span className="flex text-base leading-none" aria-label={`魔力 ${magic}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} style={{ color: i < magic ? color : "var(--border)" }}>
              {i < magic ? "♥" : "♡"}
            </span>
          ))}
        </span>
        <span className="tnum text-xs font-semibold" style={{ color }}>
          {magic}/{total}
        </span>
      </span>
    </div>
  );
}

function BenchAvatar({
  catalog,
  active,
  disabled,
  selected,
  onPick,
}: {
  catalog: Catalog;
  active: ActiveSpriteState;
  disabled?: boolean;
  selected?: boolean;
  onPick: () => void;
}) {
  const sprite = spriteOf(catalog, active.spriteId);
  const dead = active.hp <= 0;
  const panel =
    catalog.stats && active.profile ? computeStats(catalog.stats, { race: sprite?.race ?? {} }, active.profile) : null;
  const hpPct = active.maxHp > 0 ? Math.max(0, (active.hp / active.maxHp) * 100) : 0;

  return (
    <PetHoverCard catalog={catalog} sprite={sprite} active={active} headline="场下">
      <button
        type="button"
        disabled={disabled || dead}
        onClick={onPick}
        title={sprite ? `换上 ${sprite.name}` : "换人"}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-sm border p-1 text-center transition-colors",
          selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
          dead && "opacity-40",
          disabled && "cursor-not-allowed",
        )}
      >
        <SpriteImage sprite={sprite} size="sm" className="h-9 w-9 rounded-sm" />
        <span className="w-full truncate text-[10px] font-medium">{sprite?.name ?? active.spriteId}</span>
        <Progress value={hpPct} indicatorClassName="bg-success" className="h-1.5" />
        <span className="tnum w-full truncate text-[9px] text-muted-foreground">
          {Math.round(hpPct)}% · 能{active.energy}
        </span>
        <span className="tnum w-full truncate text-[9px] text-muted-foreground">
          {panel ? `攻${panel.atk} 防${panel.defense} 速${panel.speed}` : `HP ${active.hp}/${active.maxHp}`}
        </span>
      </button>
    </PetHoverCard>
  );
}

export function ActiveBoard({
  catalog,
  side,
  tone,
  title,
  subtitle,
  maxMagic,
  rec,
  legalSkillIds,
  selectedKey,
  selectedBenchId,
  disabled,
  benchDisabled,
  fainted,
  otherOptions,
  onUseSkill,
  onChangeSlot,
  onUseOther,
  onPickBench,
}: {
  catalog: Catalog;
  side: SideState;
  tone: Tone;
  title: string;
  subtitle?: string;
  maxMagic: number;
  rec: RecommendResult | null;
  /** 引擎合法技能集合（缺省 = 未知，不屏蔽）。用于屏蔽「受规则/特性限制」的不可用技能。 */
  legalSkillIds?: Set<string>;
  selectedKey: string | null;
  selectedBenchId: string | null;
  disabled?: boolean;
  /** 场下头像单独判定：场上阵亡时仍需可点（换人上场）。 */
  benchDisabled?: boolean;
  fainted: boolean;
  otherOptions: ActionOption[];
  onUseSkill: (skillId: string) => void;
  onChangeSlot: (index: number, skillId: string) => void;
  onUseOther: (option: ActionOption) => void;
  onPickBench: (benchId: string) => void;
}) {
  const sprite = spriteOf(catalog, side.active.spriteId);
  const panel =
    catalog.stats && side.active.profile
      ? computeStats(catalog.stats, { race: sprite?.race ?? {} }, side.active.profile)
      : null;
  const color = toneColor(tone);
  const hpPct = side.active.maxHp > 0 ? Math.max(0, (side.active.hp / side.active.maxHp) * 100) : 0;
  const headSrc = sprite?.head || sprite?.image;
  // 特性 / 状态触发的能耗修改（隐藏类除外）——头像角标 + hover 明细。
  const traitCostMods = (side.active.costMods ?? []).filter((m) => (m.source === "trait" || m.source === "status") && !m.hidden);
  const traitCostTitle = traitCostMods
    .map((m) => `${m.sourceId ?? m.source}：能耗${m.delta ? (m.delta > 0 ? `+${m.delta}` : `${m.delta}`) : ""}${m.multiply ? `×${m.multiply}` : ""}${m.duration === "turns" ? `（剩 ${m.turnsLeft ?? 0} 回合）` : ""}`)
    .join("\n");

  return (
    <section className="flex flex-col gap-2 rounded-md border bg-card p-2.5">
      <MagicHearts magic={side.magic} max={maxMagic} tone={tone} />

      <div className="flex items-center gap-2">
        <PetHoverCard catalog={catalog} sprite={sprite} active={side.active} headline={title}>
          <div className="relative grid h-24 w-24 shrink-0 cursor-help place-items-center overflow-hidden rounded-md border bg-muted/40 min-[860px]:h-28 min-[860px]:w-28">
            {headSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headSrc} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-2xl font-semibold text-muted-foreground">{sprite?.name?.slice(0, 1) ?? "?"}</span>
            )}
            {traitCostMods.length > 0 && (
              <span
                title={traitCostTitle}
                className="absolute bottom-1 right-1 cursor-help rounded-sm bg-amber-500/90 px-1 text-[10px] font-semibold leading-4 text-white"
              >
                特性
              </span>
            )}
          </div>
        </PetHoverCard>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold" style={{ color }}>
              {title}
            </span>
            <span className="truncate text-[13px] font-medium">{sprite?.name ?? side.active.spriteId}</span>
            {sprite?.elements.map((el) => (
              <ElementBadge key={el} catalog={catalog} element={el} />
            ))}
          </div>
          {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-7 shrink-0">HP</span>
            <Progress value={hpPct} indicatorClassName="bg-success" className="flex-1" />
            <span className="tnum shrink-0 font-semibold text-foreground">{Math.round(hpPct)}%</span>
            <span className="tnum shrink-0">
              {side.active.hp}/{side.active.maxHp}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="outline" className="tnum">能量 {side.active.energy}</Badge>
            {side.wishChargesLeft > 0 && <Badge variant="outline" className="tnum">愿力 {side.wishChargesLeft}</Badge>}
            {side.wishCooldown > 0 && <Badge variant="secondary" className="tnum">愿力CD {side.wishCooldown}</Badge>}
            {panel && <span className="tnum text-muted-foreground">攻{panel.atk} 防{panel.defense} 速{panel.speed}</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(side.active.statuses)
              .filter(([, n]) => n > 0)
              .map(([id, n]) => (
                <Badge key={`s-${id}`} variant="outline" className="tnum">
                  {catalog.statuses.find((s) => s.id === id)?.nameZh ?? id} × {n}
                </Badge>
              ))}
            {Object.entries(side.active.marks)
              .filter(([, n]) => n > 0)
              .map(([id, n]) => (
                <Badge key={`m-${id}`} variant="secondary" className="tnum">
                  {catalog.marks.find((m) => m.id === id)?.nameZh ?? id} × {n}
                </Badge>
              ))}
          </div>
        </div>
      </div>

      {fainted ? (
        <p className="rounded-sm border border-destructive/50 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">
          场上精灵已阵亡 · 点下方场下头像选择上场精灵
        </p>
      ) : (
        <>
          <SkillGrid
            catalog={catalog}
            side={side}
            rec={rec}
            legalSkillIds={legalSkillIds}
            tone={tone}
            selectedKey={selectedKey}
            disabled={disabled}
            onUse={onUseSkill}
            onChangeSlot={onChangeSlot}
          />
          <OtherActions
            options={otherOptions}
            rec={rec}
            tone={tone}
            selectedKey={selectedKey}
            disabled={disabled}
            onUse={onUseOther}
          />
        </>
      )}

      <div className="grid grid-cols-5 gap-1">
        {side.bench.map((b) => (
          <BenchAvatar
            key={b.spriteId}
            catalog={catalog}
            active={b}
            disabled={benchDisabled}
            selected={selectedBenchId === b.spriteId}
            onPick={() => onPickBench(b.spriteId)}
          />
        ))}
      </div>
    </section>
  );
}
