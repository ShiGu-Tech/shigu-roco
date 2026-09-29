"use client";

import { useState } from "react";

import { NaturePicker } from "@/components/nature-picker";
import { SkillSelector } from "@/components/skill-selector";
import { SpriteImage } from "@/components/sprite-image";
import { StatRadar } from "@/components/stat-radar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import { computeStats, type StatKey } from "@/modules/engine/stats";
import { MAX_INVEST, MAX_TALENT, profileFromSetup, type PetSetup } from "@/modules/battle/pet";
import type { Catalog, CatalogSprite } from "@/modules/battle/types";

const STAT_ORDER: StatKey[] = [...PANEL_ORDER];

function elementZh(catalog: Catalog, key: string): string {
  return catalog.elements.find((el) => el.name === key)?.nameZh ?? key;
}

/** 三维及加点：最多 3 项，滑条 1~10。 */
function InvestEditor({
  setup,
  panel,
  onChange,
}: {
  setup: PetSetup;
  panel: Record<StatKey, number> | null;
  onChange: (setup: PetSetup) => void;
}) {
  const invested = STAT_ORDER.filter((k) => setup.talent[k] != null);

  function setTalent(key: StatKey, value: number | null) {
    const talent = { ...setup.talent };
    if (value == null) delete talent[key];
    else talent[key] = value;
    onChange({ ...setup, talent });
  }

  function toggle(key: StatKey) {
    const on = setup.talent[key] != null;
    if (!on && invested.length >= MAX_INVEST) return;
    setTalent(key, on ? null : MAX_TALENT);
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        三维及加点（最多 {MAX_INVEST} 项，滑条 1~{MAX_TALENT} 档）
      </Label>
      {STAT_ORDER.map((key) => {
        const on = setup.talent[key] != null;
        const blocked = !on && invested.length >= MAX_INVEST;
        return (
          <div key={key} className="flex items-center gap-1.5 min-[520px]:gap-2">
            <Button
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              className="h-7 w-11 shrink-0 px-0 text-[11px] min-[520px]:h-8 min-[520px]:w-14 min-[520px]:px-3 min-[520px]:text-xs"
              aria-pressed={on}
              disabled={blocked}
              onClick={() => toggle(key)}
            >
              加点
            </Button>
            <span className="w-7 shrink-0 text-[11px] min-[520px]:w-10 min-[520px]:text-xs">{STAT_LABEL[key]}</span>
            <Slider
              value={setup.talent[key] ?? MAX_TALENT}
              min={1}
              max={MAX_TALENT}
              step={1}
              disabled={!on}
              aria-label={`${STAT_LABEL[key]} 加点`}
              onValueChange={(v) => setTalent(key, v)}
            />
            <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums min-[520px]:w-6 min-[520px]:text-xs">
              {on ? setup.talent[key] : "—"}
            </span>
            <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums min-[520px]:w-10 min-[520px]:text-sm">
              {panel ? panel[key] : "?"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface PetConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  spriteId: string;
  setup: PetSetup;
  onSetupChange: (setup: PetSetup) => void;
  title?: string;
  /** 是否显示技能配置（默认显示）。 */
  showSkills?: boolean;
}

/**
 * 通用「精灵参数配置」弹窗：等级 / 星级 / 性格矩阵 / 三维加点（滑条）/ 面板雷达图 / 出战技能。
 * 编辑即时生效（由调用方持有 setup）。
 */
export function PetConfigDialog({
  open,
  onOpenChange,
  catalog,
  spriteId,
  setup,
  onSetupChange,
  title,
  showSkills = true,
}: PetConfigDialogProps) {
  const [skillOpen, setSkillOpen] = useState(false);
  const [slot, setSlot] = useState(0);
  const sprite: CatalogSprite | undefined = catalog.sprites.find((s) => s.id === spriteId);

  const panel = sprite && catalog.stats ? computeStats(catalog.stats, { race: sprite.race }, profileFromSetup(setup)) : null;
  const baseline =
    sprite && catalog.stats
      ? computeStats(catalog.stats, { race: sprite.race }, profileFromSetup({ ...setup, nature: "neutral", talent: {} }))
      : null;
  const invested = STAT_ORDER.filter((k) => setup.talent[k] != null).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <SpriteImage sprite={sprite} size="md" className="h-11 w-11 min-[520px]:h-14 min-[520px]:w-14" />
            <span>{title ?? "精灵参数"}</span>
            {sprite ? <span className="text-muted-foreground">#{sprite.no} {sprite.name}</span> : null}
            {sprite?.elements.map((el) => (
              <Badge key={el} variant="outline">
                {elementZh(catalog, el)}
              </Badge>
            ))}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!sprite ? (
            <p className="text-sm text-muted-foreground">未选择精灵。</p>
          ) : (
            <>
              <div className="grid gap-3 min-[520px]:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">等级</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="tabular-nums"
                    value={setup.level}
                    onChange={(e) => onSetupChange({ ...setup, level: Number(e.target.value) || setup.level })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">星级</Label>
                  <NativeSelect
                    value={String(setup.stars)}
                    onChange={(e) => onSetupChange({ ...setup, stars: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4, 5].map((s) => (
                      <option key={s} value={s}>
                        {s}★
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">三维 / 技能</Label>
                  <p className="pt-2 text-xs text-muted-foreground">
                    {invested}/{MAX_INVEST} 项 · {setup.skills.length} 招
                  </p>
                </div>
              </div>
              <NaturePicker
                catalog={catalog}
                value={setup.nature}
                onChange={(nature) => onSetupChange({ ...setup, nature })}
              />

                <div className="grid gap-3 min-[860px]:grid-cols-2 min-[860px]:gap-4">
                <div className="rounded-md border bg-background/60 p-1">
                  {panel ? (
                    <StatRadar panel={panel} baseline={baseline} className="h-[260px] w-full" />
                  ) : (
                    <p className="p-3 text-xs text-muted-foreground">缺少面板数据。</p>
                  )}
                </div>
                <InvestEditor setup={setup} panel={panel} onChange={onSetupChange} />
              </div>

              {showSkills && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">
                      出战技能（4 槽；留空 = 用本精灵默认 4 招）
                      <span className="ml-2 text-muted-foreground">{setup.skills.length}/4</span>
                    </Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSkillOpen((v) => !v)}>
                      {skillOpen ? "收起技能表" : "选择技能"}
                    </Button>
                  </div>

                  <div className="grid gap-2 min-[520px]:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => {
                      const skillId = setup.skills[i];
                      const skill = skillId ? (catalog.allSkills ?? []).find((s) => s.id === skillId) : undefined;
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={skillOpen && slot === i ? "default" : "outline"}
                            className="min-w-0 flex-1 justify-between gap-2 font-normal"
                            onClick={() => {
                              setSlot(i);
                              setSkillOpen(true);
                            }}
                          >
                            <span className="truncate">{skill ? skill.name : `槽 ${i + 1}（空）`}</span>
                            <span className="shrink-0 text-[10px] opacity-70">
                              {skill
                                ? `${elementZh(catalog, skill.element)} · 能耗${skill.cost}`
                                : "选技能"}
                            </span>
                          </Button>
                          {skill && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`清空第 ${i + 1} 个技能槽`}
                              onClick={() => {
                                const next = [...setup.skills];
                                next.splice(i, 1);
                                onSetupChange({ ...setup, skills: next.filter(Boolean).slice(0, 4) });
                              }}
                            >
                              <span aria-hidden="true">×</span>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {skillOpen && (
                    <SkillSelector
                      catalog={catalog}
                      spriteId={spriteId}
                      value={setup.skills[slot]}
                      onSelect={(skillId) => {
                        const next = [...setup.skills];
                        next[slot] = skillId;
                        onSetupChange({ ...setup, skills: [...new Set(next.filter(Boolean))].slice(0, 4) });
                      }}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" size="sm" variant="outline" onClick={() => onSetupChange({ ...setup, talent: {} })}>
            清空加点
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
