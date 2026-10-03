"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export interface MapOption {
  id: string;
  name: string;
}

/** 键 → 数值 映射编辑器（印记 / 状态 / buff / 计数器…）：已有行改值或删除，底部追加新键。 */
export function MapEditor({
  label,
  value,
  onChange,
  options,
  keyPlaceholder = "key",
  emptyText = "（空）",
}: {
  label: string;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  options?: MapOption[];
  keyPlaceholder?: string;
  emptyText?: string;
}) {
  const entries = Object.entries(value);
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {entries.length === 0 ? <div className="text-[10px] text-muted-foreground">{emptyText}</div> : null}
      {entries.map(([key, number]) => (
        <div key={key} className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[11px] tnum" title={key}>
            {options?.find((option) => option.id === key)?.name ?? key}
          </span>
          <Input
            type="number"
            value={number}
            onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) || 0 })}
            className="h-7 w-16 px-1.5 text-[11px] tnum"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-1.5 text-[11px]"
            onClick={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          >
            ×
          </Button>
        </div>
      ))}
      <AddRow options={options} keyPlaceholder={keyPlaceholder} onAdd={(key, number) => onChange({ ...value, [key]: number })} />
    </div>
  );
}

function AddRow({
  options,
  keyPlaceholder,
  onAdd,
}: {
  options?: MapOption[];
  keyPlaceholder: string;
  onAdd: (key: string, value: number) => void;
}) {
  const [key, setKey] = useState("");
  const [number, setNumber] = useState("1");

  const commit = () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    onAdd(trimmed, Number(number) || 0);
    setKey("");
    setNumber("1");
  };

  return (
    <div className="flex items-center gap-1">
      {options ? (
        <NativeSelect value={key} onChange={(e) => setKey(e.target.value)} className="h-7 min-w-0 flex-1 px-1 text-[11px]">
          <option value="">{keyPlaceholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyPlaceholder} className="h-7 min-w-0 flex-1 px-1.5 text-[11px]" />
      )}
      <Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} className="h-7 w-16 px-1.5 text-[11px] tnum" />
      <Button type="button" size="sm" variant="outline" className="h-7 px-1.5 text-[11px]" onClick={commit}>
        +
      </Button>
    </div>
  );
}
