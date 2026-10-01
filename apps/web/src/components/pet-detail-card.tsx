"use client";

import { ElementBadge } from "@/components/element-icon";
import { SkillCategoryIcon } from "@/components/skill-category-icon";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import { computeStats, type StatKey } from "@/modules/engine/stats";
import type { ActiveSpriteState, Catalog, CatalogSprite } from "@/modules/battle/types";

export interface PetDetailCardProps {
  catalog: Catalog;
  sprite?: CatalogSprite;
  /** 有运行态时展示 HP / 能量 / 状态 / 印记 / 出战技能。 */
  active?: ActiveSpriteState;
  /** 侧栏标题（如「我方 · 场上」）。 */
  headline?: string;
}

function natureText(catalog: Catalog, natureId?: string | null): string {
  if (!natureId) return "中性";
  const nature = (catalog.stats?.natures ?? []).find((n) => n.id === natureId);
  if (!nature) return natureId;
  const up = nature.up ? ` · ${STAT_LABEL[nature.up as StatKey]}↑` : "";
  const down = nature.down ? ` · ${STAT_LABEL[nature.down as StatKey]}↓` : "";
  return `${nature.nameZh ?? nature.name ?? nature.id}${up}${down}`;
}

/** 精灵详情卡内容：供 HoverCard（桌面）与弹窗（触屏）复用。 */
export function PetDetailCard({ catalog, sprite, active, headline }: PetDetailCardProps) {
  if (!sprite) {
    return <p className="p-3 text-xs text-muted-foreground">未找到该精灵。</p>;
  }
  const profile = active?.profile;
  const panel =
    catalog.stats && profile ? computeStats(catalog.stats, { race: sprite.race }, profile) : null;
  const skillIds = active?.loadout?.length ? active.loadout : sprite.skills.slice(0, 4).map((s) => s.id);
  const skills = skillIds.map((id) => (catalog.allSkills ?? []).find((s) => s.id === id)).filter(Boolean);

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <SpriteImage sprite={sprite} size="lg" className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          {headline ? <div className="text-[11px] text-muted-foreground">{headline}</div> : null}
          <div className="truncate text-[13px] font-semibold">
            #{sprite.no} {sprite.name}
            {sprite.form ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{sprite.form}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {sprite.elements.map((el) => (
              <ElementBadge key={el} catalog={catalog} element={el} />
            ))}
            {profile?.level != null && <Badge variant="outline" className="tnum">{profile.level} 级</Badge>}
            {profile?.stars != null && <Badge variant="outline" className="tnum">{profile.stars}★</Badge>}
            <Badge variant="outline">{natureText(catalog, profile?.nature)}</Badge>
          </div>
        </div>
      </div>

      {active && (
        <div className="flex items-center gap-2 text-[12px]">
          <Badge variant="outline" className="tnum">HP {active.hp}/{active.maxHp}</Badge>
          <Badge variant="outline" className="tnum">能量 {active.energy}</Badge>
        </div>
      )}

      {sprite.trait?.name ? (
        <div className="rounded-sm border bg-muted/40 p-2 text-[12px]">
          <span className="font-medium">特性 {sprite.trait.name}</span>
          {sprite.trait.desc ? <p className="mt-0.5 leading-5 text-muted-foreground">{sprite.trait.desc}</p> : null}
        </div>
      ) : null}

      {panel && (
        <div className="grid grid-cols-3 gap-1">
          {PANEL_ORDER.map((k) => (
            <div key={k} className="rounded-sm border bg-muted/40 px-1.5 py-1 text-center">
              <div className="text-[10px] text-muted-foreground">{STAT_LABEL[k]}</div>
              <div className="tnum text-[13px] font-semibold">{panel[k]}</div>
            </div>
          ))}
        </div>
      )}

      {active && (Object.keys(active.statuses).length > 0 || Object.keys(active.marks).length > 0) && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(active.statuses)
            .filter(([, n]) => n > 0)
            .map(([id, n]) => (
              <Badge key={`s-${id}`} variant="outline" className="tnum">
                {catalog.statuses.find((s) => s.id === id)?.nameZh ?? id} × {n}
              </Badge>
            ))}
          {Object.entries(active.marks)
            .filter(([, n]) => n > 0)
            .map(([id, n]) => (
              <Badge key={`m-${id}`} variant="secondary" className="tnum">
                {catalog.marks.find((m) => m.id === id)?.nameZh ?? id} × {n}
              </Badge>
            ))}
        </div>
      )}

      {skills.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-muted-foreground">出战技能</div>
          {skills.map(
            (sk) =>
              sk && (
                <div key={sk.id} className="flex items-center gap-1.5 text-[12px]">
                  <SkillCategoryIcon skill={sk} size={14} />
                  <span className="truncate font-medium">{sk.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    能耗{sk.cost}
                    {sk.power ? ` · 威力${sk.power}` : ""}
                  </span>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
}
