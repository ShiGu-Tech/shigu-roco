"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import type { StatKey } from "@/modules/engine/stats";
import type { Catalog } from "@/modules/battle/types";

const STAT_ORDER: StatKey[] = [...PANEL_ORDER];

export interface NaturePickerProps {
  catalog: Catalog;
  /** 当前性格 id；null / "" = 中性。 */
  value: string | null;
  onChange: (natureId: string) => void;
}

/** 性格矩阵：行 = ↑提升项、列 = ↓下降项（同行同列不成立），点一格即选。 */
export function NaturePicker({ catalog, value, onChange }: NaturePickerProps) {
  const natures = catalog.stats?.natures ?? [];
  const current = natures.find((n) => n.id === value);
  const up = (current?.up ?? null) as StatKey | null;
  const down = (current?.down ?? null) as StatKey | null;

  function pick(upKey: StatKey | null, downKey: StatKey | null) {
    if (upKey === null || downKey === null) {
      onChange("neutral");
      return;
    }
    const found = natures.find((n) => (n.up ?? null) === upKey && (n.down ?? null) === downKey);
    if (found) onChange(found.id);
    else toast.error(`${STAT_LABEL[upKey]}↑ ${STAT_LABEL[downKey]}↓ 性格数据缺失，请刷新页面`);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">
          性格（行 ↑提升 · 列 ↓下降）
          <span className="ml-2 text-muted-foreground">
            {current ? `${current.nameZh ?? current.name ?? current.id}` : "未选"}
            {up ? ` · ${STAT_LABEL[up]}↑` : ""}
            {down ? ` · ${STAT_LABEL[down]}↓` : ""}
          </span>
        </Label>
        <Button type="button" size="sm" variant={!up && !down ? "default" : "outline"} onClick={() => pick(null, null)}>
          中性
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[268px] grid-cols-[40px_repeat(6,minmax(38px,1fr))] gap-1 min-[520px]:min-w-[360px] min-[520px]:grid-cols-[46px_repeat(6,minmax(40px,1fr))]">
          <span />
          {STAT_ORDER.map((k) => (
            <span key={`h-${k}`} className="text-center text-[10px] text-muted-foreground">
              {STAT_LABEL[k]}↓
            </span>
          ))}
          {STAT_ORDER.map((upKey) => [
            <span key={`l-${upKey}`} className="flex items-center text-[10px] text-muted-foreground">
              {STAT_LABEL[upKey]}↑
            </span>,
            ...STAT_ORDER.map((downKey) => {
              const same = upKey === downKey;
              const active = up === upKey && down === downKey;
              const target = natures.find((n) => (n.up ?? null) === upKey && (n.down ?? null) === downKey);
              return (
                <button
                  key={`${upKey}-${downKey}`}
                  type="button"
                  disabled={same}
                  title={same ? undefined : (target?.nameZh ?? target?.name ?? `${STAT_LABEL[upKey]}↑ ${STAT_LABEL[downKey]}↓`)}
                  onClick={() => pick(upKey, downKey)}
                  className={[
                    "h-6 rounded border text-[11px] transition-colors min-[520px]:h-7",
                    same
                      ? "cursor-not-allowed border-border/60 bg-muted/60 text-muted-foreground/50"
                      : active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/50 hover:bg-accent",
                  ].join(" ")}
                >
                  {same ? "—" : active ? "✓" : ""}
                </button>
              );
            }),
          ])}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium">行 = 提升项、列 = 下降项</span>，点一格即选；标 «—» 的斜线格是同一项，不能同时又升又降。
      </p>
    </div>
  );
}
