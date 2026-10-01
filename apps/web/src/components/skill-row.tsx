"use client";

import type { ReactNode } from "react";

import { ElementIcon } from "@/components/element-icon";
import { SkillCategoryIcon } from "@/components/skill-category-icon";
import { cn } from "cn";
import type { Catalog, CatalogSkill } from "@/modules/battle/types";

function SkillMeta({ catalog, skill }: { catalog: Catalog; skill: CatalogSkill }) {
  const elementZh = catalog.elements.find((e) => e.name === skill.element)?.nameZh ?? skill.elementZh ?? skill.element;
  return (
    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="inline-flex items-center gap-0.5">
          <ElementIcon catalog={catalog} element={skill.element} size={13} />
          {elementZh}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <SkillCategoryIcon skill={skill} size={13} />
          {skill.categoryZh ?? skill.category}
        </span>
      </span>
      <span className="tnum flex flex-wrap items-center gap-x-1.5">
        <span>能耗 {skill.cost}</span>
        {skill.power ? <span>威力 {skill.power}</span> : null}
        {skill.priority ? <span>先手 +{skill.priority}</span> : null}
      </span>
    </span>
  );
}

export interface SkillRowProps {
  catalog: Catalog;
  skill: CatalogSkill;
  selected?: boolean;
  onClick?: () => void;
  /** 右侧附加内容（如当前选中标记）。 */
  right?: ReactNode;
  className?: string;
}

/** 技能行：左图标 · 右上大字名称 · 右下「系别 / 类型 / 能耗 / 威力」。 */
export function SkillRow({ catalog, skill, selected, onClick, right, className }: SkillRowProps) {
  const body = (
    <>
      {skill.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={skill.icon} alt="" className="h-8 w-8 shrink-0 rounded-md border bg-muted object-contain" loading="lazy" />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-muted/50">
          <SkillCategoryIcon skill={skill} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{skill.name}</span>
        <SkillMeta catalog={catalog} skill={skill} />
      </span>
      {right}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left transition-colors",
          selected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cn("flex w-full items-center gap-2 px-1.5 py-1.5", className)}>{body}</div>;
}
