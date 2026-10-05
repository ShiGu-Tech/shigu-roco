"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Catalog } from "@/modules/battle/types";

import { markBloodline, markNature, markTalent, recordMagic, recordSeenSkill, type OpponentIntel } from "./intel";

const STAT_KEYS: { key: string; label: string }[] = [
  { key: "hp", label: "生命" },
  { key: "atk", label: "物攻" },
  { key: "spatk", label: "魔攻" },
  { key: "defense", label: "物防" },
  { key: "spdef", label: "魔防" },
  { key: "speed", label: "速度" },
];

/** 手动标记对手情报（技能 / 性格 / 天分 / 血脉 / 魔法），直接置为「已确认」。 */
export function IntelMarkDialog({
  open,
  onOpenChange,
  catalog,
  intel,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  /** 由调用方用 `key` 保证每次打开 / 换目标时重挂载，从而以最新 `intel` 初始化草稿。 */
  intel: OpponentIntel;
  onApply: (next: OpponentIntel) => void;
}) {
  const [draft, setDraft] = useState<OpponentIntel>(intel);
  const [addSkill, setAddSkill] = useState("");

  const natures = catalog.stats?.natures ?? [];
  const bloodlines = catalog.bloodlines ?? [];

  function talentOf(key: string): number | "" {
    const v = draft.talent.value[key];
    return v === undefined ? "" : v;
  }

  function setTalent(key: string, raw: string): void {
    const value = { ...draft.talent.value };
    if (raw === "") delete value[key];
    else value[key] = Math.max(0, Math.min(10, Math.floor(Number(raw) || 0)));
    setDraft({ ...draft, talent: { value, level: "known" } });
  }

  function save(): void {
    let next = draft;
    next = markNature(next, next.nature.value);
    next = markTalent(next, next.talent.value);
    next = markBloodline(next, next.bloodline.value);
    onApply(next);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base">标记对手情报</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 text-[13px]">
          {/* 技能 */}
          <section className="space-y-1.5">
            <p className="font-medium text-muted-foreground">已见技能</p>
            <div className="flex flex-wrap gap-1">
              {draft.skills.length ? (
                draft.skills.map((s) => (
                  <span key={s.id} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                    {catalog.allSkills.find((x) => x.id === s.id)?.name ?? s.id}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">暂无</span>
              )}
            </div>
            <div className="flex gap-2">
              <NativeSelect value={addSkill} onChange={(e) => setAddSkill(e.target.value)} className="h-8 flex-1 text-[12px]">
                <option value="">— 追加一个技能 —</option>
                {catalog.allSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!addSkill}
                onClick={() => {
                  if (addSkill) setDraft(recordSeenSkill(draft, addSkill, 0));
                  setAddSkill("");
                }}
              >
                添加
              </Button>
            </div>
          </section>

          {/* 性格 */}
          <section className="space-y-1.5">
            <p className="font-medium text-muted-foreground">性格</p>
            <NativeSelect
              value={draft.nature.value ?? ""}
              onChange={(e) => setDraft({ ...draft, nature: { value: e.target.value || null, level: "known" } })}
              className="h-8 w-full text-[12px]"
            >
              <option value="">未知 / 中性</option>
              {natures.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nameZh ?? n.name ?? n.id}
                </option>
              ))}
            </NativeSelect>
          </section>

          {/* 天分 */}
          <section className="space-y-1.5">
            <p className="font-medium text-muted-foreground">天分（0~10，最多 3 项）</p>
            <div className="grid grid-cols-3 gap-2">
              {STAT_KEYS.map((s) => (
                <label key={s.key} className="flex items-center gap-1 text-[12px]">
                  <span className="w-8 shrink-0 text-muted-foreground">{s.label}</span>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={talentOf(s.key)}
                    onChange={(e) => setTalent(s.key, e.target.value)}
                    className="h-7 px-1.5 text-[12px] tnum"
                  />
                </label>
              ))}
            </div>
          </section>

          {/* 血脉 */}
          <section className="space-y-1.5">
            <p className="font-medium text-muted-foreground">血脉</p>
            <NativeSelect
              value={draft.bloodline.value ?? ""}
              onChange={(e) => setDraft({ ...draft, bloodline: { value: e.target.value || null, level: "known" } })}
              className="h-8 w-full text-[12px]"
            >
              <option value="">未知</option>
              {bloodlines.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </section>

          {/* 魔法 */}
          <section className="space-y-1.5">
            <p className="font-medium text-muted-foreground">魔法（已见）</p>
            <div className="flex flex-wrap gap-3 text-[12px]">
              {([
                ["wish", "愿力冲击"],
                ["leader", "首领化"],
                ["grass", "草魔法"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={draft.magic[key]}
                    onChange={(e) => setDraft(e.target.checked ? recordMagic(draft, key) : { ...draft, magic: { ...draft.magic, [key]: false } })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={save}>
            保存标记
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
