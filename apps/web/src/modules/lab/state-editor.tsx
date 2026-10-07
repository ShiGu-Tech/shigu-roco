"use client";

import { useState } from "react";
import { toast } from "sonner";

import { SkillSelector } from "@/components/skill-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import type { StatKey } from "@/modules/engine/stats";
import type { ActiveSpriteState, Catalog } from "@/modules/battle/types";

import { DEFAULT_MARK_MAX, markPolarity, polarityLabel, type LabAdapters, type MarkPolarity } from "./adapters";

/** 分区小标题：弱化的行内标签 + 细分隔线，统一版面节奏。 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** 通用「层数」编辑器：紧凑 chip 列表 + 快捷添加。 */
function StackEditor({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { id: string; label: string }[];
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const [id, setId] = useState(options[0]?.id ?? "");
  const [n, setN] = useState(1);
  if (!options.length) return null;
  const entries = Object.entries(value);
  return (
    <div className="space-y-1">
      <SectionLabel>{title}</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {entries.map(([k, v]) => (
          <Badge key={k} variant="secondary" className="gap-1 text-[11px] font-normal">
            {options.find((o) => o.id === k)?.label ?? k} × {v}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`移除 ${k}`}
              onClick={() => {
                const next = { ...value };
                delete next[k];
                onChange(next);
              }}
            >
              ×
            </button>
          </Badge>
        ))}
        {entries.length === 0 && <span className="text-[11px] text-muted-foreground">无</span>}
      </div>
      <div className="flex gap-1">
        <NativeSelect value={id} onChange={(e) => setId(e.target.value)} className="h-7 min-w-0 flex-1 text-[11px]">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="number"
          min={1}
          value={n}
          onChange={(e) => setN(Math.max(1, Number(e.target.value)))}
          className="h-7 w-14 text-[11px]"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => id && onChange({ ...value, [id]: (value[id] ?? 0) + n })}
        >
          加
        </Button>
      </div>
    </div>
  );
}

/** 自由键值编辑器（计数器）。 */
function KeyValueEditor({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const [key, setKey] = useState("");
  const [n, setN] = useState(1);
  return (
    <div className="space-y-1">
      <SectionLabel>计数器</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {Object.entries(value).map(([k, v]) => (
          <Badge key={k} variant="outline" className="gap-1 text-[11px] font-normal">
            {k} = {v}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`移除 ${k}`}
              onClick={() => {
                const next = { ...value };
                delete next[k];
                onChange(next);
              }}
            >
              ×
            </button>
          </Badge>
        ))}
        {Object.keys(value).length === 0 && <span className="text-[11px] text-muted-foreground">无</span>}
      </div>
      <div className="flex gap-1">
        <Input
          value={key}
          placeholder="键（如 combo-add）"
          onChange={(e) => setKey(e.target.value)}
          className="h-7 min-w-0 flex-1 text-[11px]"
        />
        <Input
          type="number"
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          className="h-7 w-14 text-[11px]"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => key.trim() && onChange({ ...value, [key.trim()]: n })}
        >
          加
        </Button>
      </div>
    </div>
  );
}

/** 属性增益 / 减益：选「属性 + 升 / 降 + 数值%」加入（增益存正、减益存负）。 */
function StageEditor({
  active,
  onPatch,
}: {
  active: ActiveSpriteState;
  onPatch: (mutate: (a: ActiveSpriteState) => void) => void;
}) {
  const [stat, setStat] = useState<StatKey>("atk");
  const [dir, setDir] = useState<"up" | "down">("up");
  const [pct, setPct] = useState(10);

  const entries = PANEL_ORDER.flatMap((k) => {
    const out: { k: StatKey; v: number; up: boolean }[] = [];
    if (active.buffs[k]) out.push({ k, v: active.buffs[k], up: true });
    if (active.debuffs[k]) out.push({ k, v: active.debuffs[k], up: false });
    return out;
  });

  function add() {
    onPatch((a) => {
      const bucket = dir === "up" ? "buffs" : "debuffs";
      const next = { ...(a[bucket] ?? {}) };
      next[stat] = dir === "up" ? pct / 100 : -Math.abs(pct) / 100;
      a[bucket] = next;
    });
  }

  return (
    <div className="space-y-1">
      <SectionLabel>属性增益 / 减益</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {entries.map(({ k, v, up }) => (
          <Badge key={`${k}-${up}`} variant={up ? "secondary" : "outline"} className="gap-1 text-[11px] font-normal">
            <span className={up ? "text-success" : "text-destructive"}>
              {STAT_LABEL[k]} {up ? "+" : ""}
              {Math.round(v * 100)}%
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`移除 ${STAT_LABEL[k]}${up ? "增益" : "减益"}`}
              onClick={() =>
                onPatch((a) => {
                  const bucket = up ? "buffs" : "debuffs";
                  const next = { ...(a[bucket] ?? {}) };
                  delete next[k];
                  a[bucket] = next;
                })
              }
            >
              ×
            </button>
          </Badge>
        ))}
        {entries.length === 0 && <span className="text-[11px] text-muted-foreground">无</span>}
      </div>
      <div className="flex gap-1">
        <NativeSelect value={stat} onChange={(e) => setStat(e.target.value as StatKey)} className="h-7 min-w-0 flex-1 text-[11px]">
          {PANEL_ORDER.map((k) => (
            <option key={k} value={k}>
              {STAT_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={dir} onChange={(e) => setDir(e.target.value as "up" | "down")} className="h-7 w-16 text-[11px]">
          <option value="up">增益</option>
          <option value="down">减益</option>
        </NativeSelect>
        <Input
          type="number"
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="h-7 w-14 text-[11px]"
        />
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={add}>
          加
        </Button>
      </div>
    </div>
  );
}

/** 出战技能：4 槽，点击槽位用 `SkillSelector` 选技能，直接改 `active.loadout`。 */
function SkillEditor({
  catalog,
  active,
  onPatch,
}: {
  catalog: Catalog;
  active: ActiveSpriteState;
  onPatch: (mutate: (a: ActiveSpriteState) => void) => void;
}) {
  const [slot, setSlot] = useState<number | null>(null);
  const skills = active.loadout;

  return (
    <div className="space-y-1">
      <SectionLabel>出战技能（{skills.filter(Boolean).length}/4）</SectionLabel>
      <div className="grid grid-cols-2 gap-1">
        {[0, 1, 2, 3].map((i) => {
          const id = skills[i];
          const sk = id ? catalog.allSkills.find((s) => s.id === id) : undefined;
          return (
            <Button
              key={i}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 justify-between gap-1 px-2 text-[11px] font-normal"
              onClick={() => setSlot(i)}
            >
              <span className="truncate">{sk ? sk.name : `槽 ${i + 1}`}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{sk ? sk.cost : "选"}</span>
            </Button>
          );
        })}
      </div>

      <Dialog open={slot !== null} onOpenChange={(open) => !open && setSlot(null)}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="text-base">选择技能 · 槽 {(slot ?? 0) + 1}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <SkillSelector
              catalog={catalog}
              spriteId={active.spriteId}
              value={slot !== null ? skills[slot] : undefined}
              onSelect={(skillId) => {
                if (slot === null) return;
                onPatch((a) => {
                  const next = [...a.loadout];
                  next[slot] = skillId;
                  a.loadout = next.filter(Boolean).slice(0, 4);
                });
                setSlot(null);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 印记编辑器：按正 / 负面分组，一般各最多 1 个（可被适配表覆盖），超限提示。 */
function MarkEditor({
  catalog,
  adapters,
  spriteMax,
  value,
  onChange,
}: {
  catalog: Catalog;
  adapters: LabAdapters | null;
  spriteMax?: { positive: number; negative: number };
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const [id, setId] = useState(catalog.marks[0]?.id ?? "");
  const [n, setN] = useState(1);
  const label = (mid: string) => catalog.marks.find((m) => m.id === mid)?.nameZh ?? mid;
  const maxFor = (mid: string, p: MarkPolarity) =>
    adapters?.marks?.[mid]?.max ?? (p === "positive" ? spriteMax?.positive : spriteMax?.negative) ?? DEFAULT_MARK_MAX;

  function add() {
    if (!id) return;
    const p = markPolarity(adapters, id);
    const same = Object.keys(value).filter((k) => markPolarity(adapters, k) === p);
    const max = maxFor(id, p);
    if (!value[id] && same.length >= max) {
      toast.error(`${polarityLabel(p)}印记一般最多 ${max} 个（当前：${same.map(label).join("、")}）`);
      return;
    }
    onChange({ ...value, [id]: (value[id] ?? 0) + n });
  }

  const entries = Object.entries(value);
  return (
    <div className="space-y-1">
      <SectionLabel>印记（正 / 负面）</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {entries.map(([k, v]) => {
          const p = markPolarity(adapters, k);
          return (
            <Badge key={k} variant="secondary" className="gap-1 text-[11px] font-normal">
              <span className={p === "positive" ? "text-success" : "text-destructive"}>
                {polarityLabel(p)}·{label(k)} ×{v}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`移除 ${k}`}
                onClick={() => {
                  const next = { ...value };
                  delete next[k];
                  onChange(next);
                }}
              >
                ×
              </button>
            </Badge>
          );
        })}
        {entries.length === 0 && <span className="text-[11px] text-muted-foreground">无</span>}
      </div>
      <div className="flex gap-1">
        <NativeSelect value={id} onChange={(e) => setId(e.target.value)} className="h-7 min-w-0 flex-1 text-[11px]">
          {catalog.marks.map((m) => (
            <option key={m.id} value={m.id}>
              {polarityLabel(markPolarity(adapters, m.id))} · {m.nameZh ?? m.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="number"
          min={1}
          value={n}
          onChange={(e) => setN(Math.max(1, Number(e.target.value)))}
          className="h-7 w-14 text-[11px]"
        />
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={add}>
          加
        </Button>
      </div>
    </div>
  );
}

export interface StateEditorProps {
  catalog: Catalog;
  active: ActiveSpriteState;
  adapters?: LabAdapters | null;
  /** 该精灵的印记上限覆盖（里拉鳐等：不设一对上限）。 */
  spriteMax?: { positive: number; negative: number };
  onPatch: (mutate: (a: ActiveSpriteState) => void) => void;
}

/** 实时局面编辑：血量（按 %）/ 能量 / 出战技能 / 增益减益 / 印记 / 状态 / 计数器。 */
export function StateEditor({ catalog, active, adapters = null, spriteMax, onPatch }: StateEditorProps) {
  const statusOptions = catalog.statuses.map((s) => ({ id: s.id, label: s.nameZh ?? s.name }));
  const hpPct = active.maxHp > 0 ? Math.round((active.hp / active.maxHp) * 100) : 0;

  function setHp(pct: number) {
    onPatch((a) => {
      a.hp = Math.round((Math.max(0, Math.min(100, pct)) / 100) * a.maxHp);
    });
  }

  return (
    <div className="space-y-2.5 text-xs">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">当前 HP</span>
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {active.hp} / {active.maxHp}（{hpPct}%）
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Slider value={hpPct} min={0} max={100} step={1} aria-label="当前 HP 百分比" onValueChange={setHp} className="flex-1" />
          <Input
            type="number"
            min={0}
            max={100}
            value={hpPct}
            onChange={(e) => setHp(Number(e.target.value))}
            className="h-7 w-14 text-[11px]"
          />
          <span className="text-[11px] text-muted-foreground">%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">最大 HP</span>
          <Input
            type="number"
            value={active.maxHp}
            onChange={(e) => onPatch((a) => void (a.maxHp = Math.max(1, Number(e.target.value))))}
            className="h-7 text-[11px]"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">能量</span>
          <Input
            type="number"
            value={active.energy}
            onChange={(e) => onPatch((a) => void (a.energy = Math.max(0, Number(e.target.value))))}
            className="h-7 text-[11px]"
          />
        </div>
      </div>

      <SkillEditor catalog={catalog} active={active} onPatch={onPatch} />
      <StageEditor active={active} onPatch={onPatch} />
      <MarkEditor
        catalog={catalog}
        adapters={adapters}
        spriteMax={spriteMax}
        value={active.marks}
        onChange={(marks) => onPatch((a) => void (a.marks = marks))}
      />
      <StackEditor
        title="状态"
        options={statusOptions}
        value={active.statuses}
        onChange={(statuses) => onPatch((a) => void (a.statuses = statuses))}
      />
      <KeyValueEditor value={active.counters ?? {}} onChange={(counters) => onPatch((a) => void (a.counters = counters))} />
    </div>
  );
}
