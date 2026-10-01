"use client";

import { useMemo, useState } from "react";

import { ElementBadge, ElementIcon } from "@/components/element-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpriteImage } from "@/components/sprite-image";
import { cn } from "cn";
import type { Catalog, CatalogSprite } from "@/modules/battle/types";

/** 同一「种族」（图鉴号 no）下的所有形态。 */
interface Species {
  no: number;
  name: string;
  elements: string[];
  variants: CatalogSprite[];
}

/** 按 no 归并种族，形态按 formId 排序（第一个为基准形态）。 */
function buildSpecies(catalog: Catalog): Species[] {
  const groups = new Map<number, CatalogSprite[]>();
  for (const sprite of catalog.sprites) {
    const list = groups.get(sprite.no) ?? [];
    list.push(sprite);
    groups.set(sprite.no, list);
  }
  return [...groups.entries()]
    .map(([no, list]) => {
      const variants = [...list].sort((a, b) => (a.formId ?? 1) - (b.formId ?? 1));
      const base = variants[0];
      return { no, name: base.nameZh ?? base.name, elements: base.elements, variants };
    })
    .sort((a, b) => a.no - b.no);
}

const MAX_ROWS = 80;

export interface PetSelectorProps {
  catalog: Catalog;
  /** 当前选中的精灵 id。 */
  value?: string;
  onSelect: (spriteId: string, sprite: CatalogSprite) => void;
  className?: string;
}

/**
 * 通用精灵选择器：顶部系别筛选、名字模糊搜索；
 * 同一 no（种族）的多个形态默认展开（可勾选关闭），点形态即选中。
 */
export function PetSelector({ catalog, value, onSelect, className }: PetSelectorProps) {
  const [element, setElement] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const species = useMemo(() => buildSpecies(catalog), [catalog]);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      species.filter((sp) => {
        if (element && !sp.elements.includes(element)) return false;
        if (!q) return true;
        if (String(sp.no) === q) return true;
        return sp.variants.some((v) => `${v.name}${v.nameZh ?? ""}${v.form ?? ""}`.toLowerCase().includes(q));
      }),
    [species, element, q],
  );

  function toggle(no: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 min-[520px]:mx-0 min-[520px]:flex-wrap min-[520px]:overflow-visible min-[520px]:px-0 min-[520px]:pb-0">
        <Button type="button" size="sm" variant={element === null ? "default" : "outline"} className="shrink-0" onClick={() => setElement(null)}>
          全部
        </Button>
        {catalog.elements.map((el) => (
          <Button
            key={el.name}
            type="button"
            size="sm"
            variant={element === el.name ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setElement(el.name)}
          >
            <ElementIcon catalog={catalog} element={el.name} size={14} />
            {el.nameZh ?? el.name}
          </Button>
        ))}
      </div>

      <Input
        value={query}
        placeholder="按名字 / 图鉴号模糊搜索…"
        className="h-8 text-xs"
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="max-h-[320px] overflow-y-auto rounded-md border">
        {filtered.length === 0 && <p className="p-3 text-xs text-muted-foreground">没有匹配的精灵。</p>}
        {filtered.slice(0, MAX_ROWS).map((sp) => {
          const open = !collapsed.has(sp.no);
          const multi = sp.variants.length > 1;
          const active = sp.variants.some((v) => v.id === value);
          return (
            <div key={sp.no} className="border-b p-2 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <SpriteImage sprite={sp.variants[0]} size="sm" className="h-11 w-11 rounded-lg" />
                <button
                  type="button"
                  onClick={() => onSelect(sp.variants[0].id, sp.variants[0])}
                  className={cn(
                    "rounded px-1 text-xs font-medium hover:underline",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  #{sp.no} {sp.name}
                </button>
                {sp.elements.map((el) => (
                  <ElementBadge key={el} catalog={catalog} element={el} />
                ))}
                {multi && (
                  <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={open}
                      onChange={() => toggle(sp.no)}
                    />
                    同种族 {sp.variants.length} 形态
                  </label>
                )}
              </div>
              {multi && open && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 min-[520px]:grid-cols-3">
                   {sp.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onSelect(v.id, v)}
                       className={cn(
                         "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px]",
                        v.id === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/50 hover:bg-accent",
                      )}
                    >
                       <>
                         <SpriteImage sprite={v} size="sm" className="h-8 w-8 rounded-md" />
                         <span className="min-w-0 truncate">{v.form ?? "基础形态"}</span>
                       </>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length > MAX_ROWS && (
          <p className="p-2 text-[11px] text-muted-foreground">
            还有 {filtered.length - MAX_ROWS} 条，细化搜索后继续。
          </p>
        )}
      </div>
    </div>
  );
}
