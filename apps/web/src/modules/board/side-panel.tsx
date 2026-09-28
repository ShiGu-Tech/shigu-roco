"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import type { ActiveSpriteState, Catalog, CatalogSkill, RecommendResult, SideState } from "@/modules/battle/types";
import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import {
  actionKey,
  elementZh,
  energyRule,
  ownSkills,
  skillById,
  spriteOf,
  type ActionOption,
} from "./util";

export type Tone = "player" | "enemy";

function toneColor(tone: Tone): string {
  return tone === "player" ? PLAYER_COLOR : ENEMY_COLOR;
}

function MagicHearts({ magic, max, tone }: { magic: number; max: number; tone: Tone }) {
  const total = Math.max(1, max, magic);
  const color = toneColor(tone);
  return (
    <div className="mb-1 flex items-center gap-2">
      <div className="flex text-base leading-none" aria-label={`魔力 ${magic}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} style={{ color: i < magic ? color : "var(--border)" }}>
            {i < magic ? "♥" : "♡"}
          </span>
        ))}
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        魔力 {magic}/{total}
      </span>
    </div>
  );
}

function HpBar({ active }: { active: ActiveSpriteState }) {
  const prev = useRef({ id: active.spriteId, hp: active.hp });
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const p = prev.current;
    if (p.id === active.spriteId && p.hp !== active.hp) {
      setDelta(active.hp - p.hp);
      prev.current = { id: active.spriteId, hp: active.hp };
      const t = setTimeout(() => setDelta(null), 900);
      return () => clearTimeout(t);
    }
    prev.current = { id: active.spriteId, hp: active.hp };
  }, [active.spriteId, active.hp]);

  const hpPct = active.maxHp > 0 ? (active.hp / active.maxHp) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>HP</span>
        <span className="tabular-nums">
          {active.hp} / {active.maxHp}
          {delta !== null && delta !== 0 && (
            <span className={`hp-delta ml-2 font-semibold ${delta < 0 ? "text-destructive" : "text-[var(--success)]"}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </span>
      </div>
      <Progress value={hpPct} />
    </div>
  );
}

export function SpriteCard({
  title,
  subtitle,
  side,
  tone,
  catalog,
}: {
  title: string;
  subtitle?: string;
  side: SideState;
  tone: Tone;
  catalog: Catalog;
}) {
  const sprite = spriteOf(catalog, side.active.spriteId);
  const { max: energyMax } = energyRule(catalog);
  const maxMagic = Number((catalog.rules as { magicMax?: number }).magicMax ?? 4);

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <MagicHearts magic={side.magic} max={maxMagic} tone={tone} />
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/45 p-2">
          {sprite?.head ? (
            <Image
              src={sprite.head}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-md border border-border bg-background object-contain"
            />
          ) : null}
          <span className="text-sm font-medium" style={{ color: toneColor(tone) }}>
            {title}
          </span>
          <span className="text-sm font-medium">{sprite?.name ?? side.active.spriteId ?? "—"}</span>
          {sprite?.elements.map((el) => (
            <Badge key={el} variant="outline">
              {elementZh(catalog, el)}
            </Badge>
          ))}
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
        <HpBar active={side.active} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">
            能量 {side.active.energy}/{energyMax}
          </Badge>
          {side.wishChargesLeft > 0 && <Badge variant="outline">愿力 {side.wishChargesLeft}</Badge>}
          {side.wishCooldown > 0 && <Badge variant="secondary">愿力CD {side.wishCooldown}</Badge>}
          {Object.entries(side.active.marks)
            .filter(([, n]) => n > 0)
            .map(([id, n]) => (
              <Badge key={id} variant="secondary">
                {id} × {n}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function skillLabel(catalog: Catalog, sk: CatalogSkill): string {
  return `${sk.name} · ${elementZh(catalog, sk.element)} · 能耗${sk.cost}${sk.power ? ` · 威力${sk.power}` : ""}`;
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

  const own = ownSkills(catalog, spriteId);
  const ownIds = new Set(own.map((s) => s.id));

  return (
    <div
      className={[
        "relative min-w-0 rounded-md border bg-background/70 p-2 transition-all",
        selected ? "border-primary bg-accent shadow-sm shadow-primary/10" : "border-border hover:border-primary/40 hover:bg-accent/40",
        !sk ? "border-dashed" : "",
      ].join(" ")}
    >
      <button
        type="button"
        disabled={!usable}
        onClick={() => sk && onUse(sk.id)}
        className={`w-full text-left ${usable ? "" : "cursor-not-allowed"}`}
      >
        {sk ? (
          <>
            <div className="flex items-center gap-1 pr-8">
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
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {sk.categoryZh ?? sk.category} · 能耗{sk.cost}
              {sk.power ? ` · 威力${sk.power}` : ""}
              {sk.priority ? ` · 先手+${sk.priority}` : ""}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={(winRate ?? 0) * 100} className="flex-1" />
              <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: toneColor(tone) }}>
                {winRate === undefined ? "—" : `${(winRate * 100).toFixed(1)}%`}
              </span>
            </div>
          </>
        ) : (
          <div className="flex min-h-[64px] items-center justify-center text-xs text-muted-foreground">
            空槽 · 点右上「换」选择技能
          </div>
        )}
      </button>

      <div className="absolute right-1 top-1 h-6 w-8">
        <span className="pointer-events-none flex h-full w-full items-center justify-center rounded border bg-secondary text-[10px] text-secondary-foreground">
          换
        </span>
        <select
          aria-label={`第 ${index + 1} 个技能槽`}
          value={skillId}
          disabled={disabled}
          onChange={(e) => onChangeSlot(index, e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        >
          <option value="">— 空 —</option>
          <optgroup label="本精灵技能">
            {own.map((s) => (
              <option key={s.id} value={s.id}>
                {skillLabel(catalog, s)}
              </option>
            ))}
          </optgroup>
          <optgroup label="全部技能">
            {(catalog.allSkills ?? [])
              .filter((s) => !ownIds.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {skillLabel(catalog, s)}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
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
    <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
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
