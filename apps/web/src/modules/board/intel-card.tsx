"use client";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import type { Catalog } from "@/modules/battle/types";
import type { OpponentIntel } from "./intel";
import { skillById, spriteOf } from "./util";

/** 对手情报卡（真实对战）：逐只显示「已见技能」与未知 / 推测标记。 */
export function EnemyIntelCard({
  catalog,
  team,
  intel,
}: {
  catalog: Catalog;
  team: { spriteId: string }[];
  intel: Record<string, OpponentIntel>;
}) {
  return (
    <Panel title="对手情报" bodyClassName="p-2">
      <div className="space-y-1.5">
        {team.map((entry, i) => {
          const info = intel[entry.spriteId];
          const sprite = spriteOf(catalog, entry.spriteId);
          const skills = info?.skills ?? [];
          return (
            <div key={`${entry.spriteId}-${i}`} className="rounded-sm border bg-card p-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{sprite?.name ?? entry.spriteId}</span>
                <Badge variant="outline" className="tnum shrink-0 text-[10px]">技能 {skills.length} 已见</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {skills.length ? (
                  skills.map((s) => (
                    <Badge key={s.id} variant="secondary" className="text-[10px]">
                      {skillById(catalog, s.id)?.name ?? s.id}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground">技能未知</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                <span>性格未知 · 天分未知 · 血脉未知</span>
                {info?.magic.wish ? <span>· 愿力已见</span> : null}
                {info?.magic.leader ? <span>· 首领化已见</span> : null}
                {info?.magic.grass ? <span>· 草魔法已见</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
