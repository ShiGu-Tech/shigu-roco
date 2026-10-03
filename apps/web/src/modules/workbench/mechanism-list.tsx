"use client";

import { useMemo, useState } from "react";

import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import type { WorkbenchMechanism } from "./types";

const OWNER_TYPES = [
  { value: "", label: "全部归属" },
  { value: "skill", label: "技能" },
  { value: "trait", label: "特性" },
  { value: "status", label: "状态" },
  { value: "mark", label: "印记" },
  { value: "weather", label: "天气" },
  { value: "system", label: "系统" },
];

export function MechanismList({
  items,
  triggers,
  selectedId,
  onSelect,
}: {
  items: WorkbenchMechanism[];
  triggers: { name: string; title: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [ownerType, setOwnerType] = useState("");
  const [trigger, setTrigger] = useState("");
  const [showGenerated, setShowGenerated] = useState(false);
  const [onlyUnsupported, setOnlyUnsupported] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (ownerType && item.ownerType !== ownerType) return false;
      if (trigger && item.trigger !== trigger) return false;
      if (onlyUnsupported && !item.unsupported) return false;
      if (!showGenerated && item.registered) return false;
      if (q && !`${item.id} ${item.ownerName} ${item.ownerId}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, ownerType, trigger, onlyUnsupported, showGenerated, query]);

  return (
    <div className="flex h-full max-h-[360px] min-h-0 flex-col gap-2 min-[860px]:max-h-full">
      <div className="flex flex-col gap-1.5">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 id / 名称" className="h-8 text-[13px]" />
        <div className="grid grid-cols-2 gap-1.5">
          <NativeSelect value={ownerType} onChange={(e) => setOwnerType(e.target.value)} className="h-8 text-[12px]">
            {OWNER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-8 text-[12px]">
            <option value="">全部触发</option>
            {triggers.map((item) => (
              <option key={item.name} value={item.name}>
                {item.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" size="sm" variant={showGenerated ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setShowGenerated((v) => !v)}>
            显示自动生成
          </Button>
          <Button type="button" size="sm" variant={onlyUnsupported ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setOnlyUnsupported((v) => !v)}>
            只看未支持
          </Button>
          <span className="tnum text-[11px] text-muted-foreground">{filtered.length} 条</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-[12px] text-muted-foreground">没有匹配的机制</div>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "block w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                item.id === selectedId ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-medium">{item.ownerName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{triggerMetaOf(item.trigger).title}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="tnum truncate text-[10px] text-muted-foreground">{item.id}</span>
                {item.unsupported ? <Badge variant="destructive" className="px-1 py-0 text-[10px]">未支持</Badge> : null}
                {item.registered ? <Badge variant="outline" className="px-1 py-0 text-[10px]">自动生成</Badge> : null}
                {item.effectCount ? (
                  <Badge variant="outline" className="tnum px-1 py-0 text-[10px]">{item.effectCount} 效果</Badge>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
