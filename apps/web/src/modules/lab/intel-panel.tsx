"use client";

import { useState } from "react";

import { NaturePicker } from "@/components/nature-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import type { StatKey } from "@/modules/engine/stats";
import { MAX_TALENT } from "@/modules/battle/pet";
import type { Catalog } from "@/modules/battle/types";

import type { InferResult, LabIntel, TalentMap } from "./types";

function levelBadge(level: LabIntel["nature"]["level"]): string {
  return level === "known" ? "已确认" : level === "inferred" ? "推测" : "未知";
}

function levelVariant(level: LabIntel["nature"]["level"]): "default" | "secondary" | "outline" {
  return level === "known" ? "default" : level === "inferred" ? "secondary" : "outline";
}

function talentText(talent: TalentMap): string {
  const parts = PANEL_ORDER.filter((k) => (talent[k] ?? 0) > 0).map((k) => `${STAT_LABEL[k]}+${talent[k]}`);
  return parts.length ? parts.join(" · ") : "无加点";
}

function candidateText(nature: InferResult["nature"]): string {
  return nature.slice(0, 3).map((c) => `${c.name} ${Math.round(c.p * 100)}%`).join(" / ");
}

export interface IntelPanelProps {
  catalog: Catalog;
  intel: LabIntel;
  infer: InferResult;
  /** 该侧的交互记录（只读展示）。 */
  records: { id: string; text: string }[];
  bloodlines: { id: string; label: string }[];
  /** 卡片标题（默认「情报」）。 */
  title?: string;
  onMarkNature: (nature: string | null) => void;
  onMarkTalent: (talent: TalentMap) => void;
  onMarkBloodline: (id: string | null) => void;
  onClear: () => void;
}

/** 精灵情报卡：三级未知 / 推测 / 已确认 + 反推结果 + 交互记录 + 手动标记。 */
export function IntelPanel({
  catalog,
  intel,
  infer,
  records,
  bloodlines,
  title = "情报",
  onMarkNature,
  onMarkTalent,
  onMarkBloodline,
  onClear,
}: IntelPanelProps) {
  const [showNature, setShowNature] = useState(false);
  const [statKey, setStatKey] = useState<StatKey>("defense");
  const [statVal, setStatVal] = useState(MAX_TALENT);

  function skillName(id?: string): string {
    if (!id) return "";
    if (id === "defend") return "防御";
    if (id === "counter") return "应对";
    return catalog.allSkills.find((s) => s.id === id)?.name ?? id;
  }

  function markedTalent(): TalentMap {
    return intel.talent.value;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">{title}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onClear}>
          清空情报
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge variant={levelVariant(intel.nature.level)}>性格 {levelBadge(intel.nature.level)}</Badge>
        <Badge variant={levelVariant(intel.talent.level)}>天分 {levelBadge(intel.talent.level)}</Badge>
        <Badge variant={levelVariant(intel.bloodline.level)}>血脉 {levelBadge(intel.bloodline.level)}</Badge>
      </div>

      {intel.skills.length > 0 && (
        <p className="text-xs text-muted-foreground">已见技能：{intel.skills.map((s) => skillName(s.id)).join("、")}</p>
      )}

      {/* 反推结果 */}
      {infer.conflict ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          两条交互推不出同一只精灵（防御 / 血量区间倒挂）。请核对「掉血% / 剩余%」没填反、且双方技能对应正确。
        </p>
      ) : infer.sampleCount > 0 && infer.defense ? (
        <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
          <p>
            反推守方防御区间：
            <span className="font-semibold tabular-nums">
              [{fmt(infer.defense[0])}, {fmt(infer.defense[1])}]
            </span>
          </p>
          {infer.maxHp && (
            <p>
              反推最大 HP：
              <span className="font-semibold tabular-nums">
                [{fmt(infer.maxHp[0])}, {fmt(infer.maxHp[1])}]
              </span>
            </p>
          )}
          <p className="text-muted-foreground">
            候选 {infer.candidateCount} 种
            {infer.recommended ? "（命中推荐加点收敛）" : infer.candidateCount > 0 ? "（已放宽匹配）" : "（暂未匹配到加点，补一次交互或核对伤害 / 掉血）"}
          </p>
          {infer.candidateCount > 0 && (
            <>
              <p>
                性格候选：<span className="font-medium">{candidateText(infer.nature) || "—"}</span>
              </p>
              {infer.talent.length > 0 && (
                <p>
                  天分高频：<span className="font-medium">{infer.talent.slice(0, 2).map((t) => talentText(t.talent)).join("；") || "—"}</span>
                </p>
              )}
            </>
          )}
          {infer.best && infer.best.length > 0 && (
            <div className="space-y-0.5 border-t pt-1">
              <p className="text-[11px] font-medium text-muted-foreground">最吻合组合（性格 · 天分 → 预测伤害）</p>
              {infer.best.slice(0, 3).map((b, i) => (
                <div key={i} className="text-[11px]">
                  <span className="font-medium">{b.nature.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {talentText(b.talent)} · 防御 {b.panel.defense} · 预测 {b.predictedDamage}（误差 {Math.round(b.error * 100)}%）
                  </span>
                </div>
              ))}
            </div>
          )}
          {infer.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-amber-600 dark:text-amber-500">
              {infer.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {infer.approximate && infer.notes.length === 0 && (
            <p className="text-amber-600 dark:text-amber-500">误差较大，已放宽拟合（可能有未计入的倍率）。</p>
          )}
        </div>
      ) : (
        infer.sampleCount > 0 && (
          <p className="text-xs text-muted-foreground">当前交互不足以反推（需要一次带技能的攻击伤害 + 掉血 / 剩余）。</p>
        )
      )}

      {/* 该侧交互记录 */}
      {records.length > 0 && (
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">受击交互</span>
          {records.map((r) => (
            <div key={r.id} className="text-[11px] text-muted-foreground">
              {r.text}
            </div>
          ))}
        </div>
      )}

      {/* 手动标记 */}
      <div className="space-y-2 rounded-md border p-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">手动标记（覆盖推断）</Label>
          <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowNature((v) => !v)}>
            {showNature ? "收起性格" : "标性格"}
          </Button>
        </div>
        {showNature && (
          <NaturePicker
            catalog={catalog}
            value={intel.nature.value}
            onChange={(nature) => {
              onMarkNature(nature);
              setShowNature(false);
            }}
          />
        )}
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {PANEL_ORDER.filter((k) => (markedTalent()[k] ?? 0) > 0).map((k) => (
              <Badge key={k} variant="secondary" className="gap-1 text-[10px]">
                {STAT_LABEL[k]} +{markedTalent()[k]}
                <button
                  type="button"
                  className="hover:text-destructive"
                  aria-label={`移除 ${k}`}
                  onClick={() => {
                    const next = { ...markedTalent() };
                    delete next[k];
                    onMarkTalent(next);
                  }}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <NativeSelect value={statKey} onChange={(e) => setStatKey(e.target.value as StatKey)} className="h-7 min-w-0 flex-1 text-xs">
              {PANEL_ORDER.map((k) => (
                <option key={k} value={k}>
                  {STAT_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
            <Input
              type="number"
              min={1}
              max={MAX_TALENT}
              value={statVal}
              onChange={(e) => setStatVal(Math.max(1, Math.min(MAX_TALENT, Number(e.target.value))))}
              className="h-7 w-14 text-xs"
            />
            <Button type="button" size="sm" variant="secondary" className="h-7" onClick={() => onMarkTalent({ ...markedTalent(), [statKey]: statVal })}>
              加天分
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">血脉</Label>
          <NativeSelect
            value={intel.bloodline.value ?? ""}
            onChange={(e) => onMarkBloodline(e.target.value || null)}
            className="h-8 text-xs"
          >
            <option value="">未知</option>
            {bloodlines.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isFinite(n) ? String(n) : "∞";
}
