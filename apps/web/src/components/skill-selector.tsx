"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "cn";
import type { Catalog, CatalogSkill } from "@/modules/battle/types";

function elementZh(catalog: Catalog, key: string): string {
  return catalog.elements.find((el) => el.name === key)?.nameZh ?? key;
}

export interface SkillSelectorProps {
  catalog: Catalog;
  /** 传入精灵后按来源分 4 列：精灵可学 / 血脉 / 技能石 / 全部。 */
  spriteId?: string;
  /** 当前选中的技能 id。 */
  value?: string;
  onSelect: (skillId: string, skill: CatalogSkill) => void;
  className?: string;
}

/**
 * 通用技能选择器：系别筛选 + 名字模糊搜索 + 按使用精灵筛选；
 * 传入 `spriteId` 时分 4 列（精灵可学技能 / 血脉技能 / 技能石技能 / 全部技能）。
 */
export function SkillSelector({ catalog, spriteId, value, onSelect, className }: SkillSelectorProps) {
  const [query, setQuery] = useState("");
  const [element, setElement] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState("");
  const [activeKey, setActiveKey] = useState("level");

  const sprite = spriteId ? catalog.sprites.find((s) => s.id === spriteId) : undefined;
  const learner = learnerId ? catalog.sprites.find((s) => s.id === learnerId) : undefined;
  const allSkills = catalog.allSkills ?? [];

  const learnerSet = useMemo(() => (learner ? new Set(learner.skills.map((s) => s.id)) : null), [learner]);
  const q = query.trim().toLowerCase();

  function pass(skill: CatalogSkill, learnerScoped: boolean): boolean {
    if (element && skill.element !== element) return false;
    if (q && !`${skill.name}${skill.nameZh ?? ""}`.toLowerCase().includes(q)) return false;
    if (learnerScoped && learnerSet && !learnerSet.has(skill.id)) return false;
    return true;
  }

  const own = sprite?.skills ?? [];
  const srcOf = (skill: CatalogSkill) => sprite?.skillSources?.[skill.id] ?? "level";

  const columns = sprite
    ? [
        { key: "level", label: "精灵可学技能", skills: own.filter((s) => srcOf(s) === "level"), learnerScoped: false },
        { key: "blood", label: "血脉技能", skills: own.filter((s) => srcOf(s) === "blood"), learnerScoped: false },
        { key: "machine", label: "技能石技能", skills: own.filter((s) => srcOf(s) === "machine"), learnerScoped: false },
        { key: "all", label: "全部技能", skills: allSkills, learnerScoped: true },
      ]
    : [{ key: "all", label: "全部技能", skills: allSkills, learnerScoped: true }];

  /** 手机分栏切换的当前列（传入精灵变了 / 只有一列时自动回退到第一列）。 */
  const currentKey = columns.some((c) => c.key === activeKey) ? activeKey : (columns[0]?.key ?? "all");

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
            {el.nameZh ?? el.name}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-2 min-[520px]:flex-row">
        <Input
          value={query}
          placeholder="按名字模糊搜索…"
          className="h-8 flex-1 text-xs"
          onChange={(e) => setQuery(e.target.value)}
        />
        <NativeSelect
          className="h-8 text-xs min-[520px]:w-56"
          value={learnerId}
          onChange={(e) => setLearnerId(e.target.value)}
        >
          <option value="">按使用精灵筛选（仅「全部技能」列）</option>
          {catalog.sprites.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.no} {s.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {columns.length > 1 && (
        <div className="grid grid-cols-2 gap-1 min-[860px]:hidden">
          {columns.map((column) => (
            <Button
              key={column.key}
              type="button"
              size="sm"
              variant={currentKey === column.key ? "default" : "outline"}
              className="justify-between"
              onClick={() => setActiveKey(column.key)}
            >
              <span className="truncate">{column.label}</span>
              <span className="text-[10px] opacity-70">
                {column.skills.filter((s) => pass(s, column.learnerScoped)).length}
              </span>
            </Button>
          ))}
        </div>
      )}

      <div className={cn("grid gap-2", columns.length === 4 ? "min-[860px]:grid-cols-4" : "min-[860px]:grid-cols-2")}>
        {columns.map((column) => {
          const list = column.skills.filter((s) => pass(s, column.learnerScoped));
          return (
            <div
              key={column.key}
              className={cn("rounded-lg border", column.key !== currentKey && "hidden min-[860px]:block")}
            >
              <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs font-medium">
                <span>{column.label}</span>
                <span className="text-muted-foreground">{list.length}</span>
              </div>
              <div className="max-h-[58vh] overflow-y-auto p-1 min-[860px]:max-h-[280px]">
                {list.length === 0 && <p className="p-2 text-[11px] text-muted-foreground">无。</p>}
                {list.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => onSelect(skill.id, skill)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs",
                      skill.id === value ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                    )}
                  >
                    {skill.icon ? (
                      // Skill icons are catalog-owned local files; plain img keeps every snapshot renderable.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={skill.icon} alt="" className="h-7 w-7 shrink-0 rounded-md border bg-muted object-contain" loading="lazy" />
                    ) : (
                      <span className="h-7 w-7 shrink-0 rounded-md border bg-muted/50" />
                    )}
                    <span className="truncate">{skill.name}</span>
                    <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
                      {elementZh(catalog, skill.element)}
                    </Badge>
                    <span className="ml-auto shrink-0 text-[10px] opacity-70">
                      能耗{skill.cost}
                      {skill.power ? ` · 威力${skill.power}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
