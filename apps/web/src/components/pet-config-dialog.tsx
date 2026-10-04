"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Image from "next/image";
import { cn } from "cn";

import { ElementBadge, ElementIcon } from "@/components/element-icon";
import { NaturePicker } from "@/components/nature-picker";
import { SkillCategoryIcon } from "@/components/skill-category-icon";
import { SkillSelector } from "@/components/skill-selector";
import { SpriteImage } from "@/components/sprite-image";
import { StatRadar } from "@/components/stat-radar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import { computeStats, type StatKey } from "@/modules/engine/stats";
import { MAX_INVEST, MAX_TALENT, profileFromSetup, type PetSetup } from "@/modules/battle/pet";
import type { Catalog, CatalogSprite } from "@/modules/battle/types";
import { bloodlineOptions, defaultBloodline, type BloodlineOption } from "@/modules/pets/instance";
import { BALL_OPTIONS, DEFAULT_BALL, ballOptionOf } from "@/modules/pets/balls";
import { recommendBuild } from "@/modules/pets/recommend";

const STAT_ORDER: StatKey[] = [...PANEL_ORDER];
const MAX_LEVEL = 60;
const MAX_STARS = 5;

/** 分区容器：边框 + 浅底，把弹窗内的各块分开。 */
function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border bg-background/50 p-3", className)}>{children}</section>;
}

/** 血脉选择：系别项用图标（title 提示名），固定项用文字；选中高亮。 */
function BloodlinePicker({
  options,
  value,
  onChange,
}: {
  options: BloodlineOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex max-h-[104px] flex-wrap gap-1 overflow-y-auto rounded-md border bg-background/60 p-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            title={o.label}
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded px-1 text-[11px] transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {o.icon ? (
              <Image src={o.icon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
            ) : (
              <span className="max-w-[72px] truncate">{o.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 咕噜球（捕捉球）选择：文字按钮（暂无官方球图标，留待接入 URL）。 */
function BallPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex max-h-[104px] flex-wrap gap-1 overflow-y-auto rounded-md border bg-background/60 p-1">
      {BALL_OPTIONS.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            title={o.label}
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-7 items-center rounded px-2 text-[11px] transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              !o.effective && !active ? "text-muted-foreground" : "",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 星级点击（好评式）：点第 n 颗 = n★；再点当前值 = 0★。 */
function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map((s) => (
        <button
          key={s}
          type="button"
          aria-label={`${s} 星`}
          aria-pressed={s <= value}
          onClick={() => onChange(value === s ? 0 : s)}
          className={cn(
            "px-0.5 text-xl leading-none transition-colors",
            s <= value ? "text-star" : "text-muted-foreground/30 hover:text-star/60",
          )}
        >
          ★
        </button>
      ))}
      <span className="ml-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{value}★</span>
    </div>
  );
}

/** 三维及加点：最多 3 项，滑条 1~10。 */
function InvestEditor({
  setup,
  panel,
  race,
  onChange,
}: {
  setup: PetSetup;
  panel: Record<StatKey, number> | null;
  race: Record<string, number>;
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
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-[520px]:gap-2">
        <span className="w-11 shrink-0 text-center min-[520px]:w-14">加点</span>
        <span className="w-7 shrink-0 text-right min-[520px]:w-9">种族</span>
        <span className="min-w-0 flex-1 text-center">天分</span>
        <span className="w-5 shrink-0 text-center min-[520px]:w-6">数值</span>
        <span className="w-7 shrink-0 text-right font-medium min-[520px]:w-10">面板</span>
      </div>
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
              {STAT_LABEL[key]}
            </Button>
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground min-[520px]:w-9 min-[520px]:text-xs">
              {race[key] ?? "—"}
            </span>
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
  /** 实例名称（可选；传入 onNameChange 才显示名称输入）。 */
  name?: string;
  onNameChange?: (name: string) => void;
  /** 是否显示技能配置（默认显示）。 */
  showSkills?: boolean;
}

/**
 * 通用「精灵参数配置」弹窗：名称 / 等级 / 星级 / 性格矩阵 / 面板雷达图 / 三维加点 / 出战技能。
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
  name,
  onNameChange,
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
  const bloodlines = bloodlineOptions(catalog);
  const effectiveBloodline = setup.bloodline || defaultBloodline(catalog, spriteId);
  const effectiveBall = setup.ball || DEFAULT_BALL;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <SpriteImage sprite={sprite} size="md" className="h-11 w-11 min-[520px]:h-14 min-[520px]:w-14" />
            <span>{name?.trim() || title || "精灵参数"}</span>
            {sprite ? <span className="text-muted-foreground">#{sprite.no} {sprite.name}</span> : null}
            {sprite?.elements.map((el) => (
              <ElementBadge key={el} catalog={catalog} element={el} />
            ))}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {!sprite ? (
            <p className="text-sm text-muted-foreground">未选择精灵。</p>
          ) : (
            <>
              {onNameChange && (
                <Section>
                  <div className="flex items-center gap-2">
                    <Label className="w-10 shrink-0 text-xs">名称</Label>
                    <Input
                      value={name ?? ""}
                      placeholder="给这只精灵取个名字"
                      onChange={(e) => onNameChange(e.target.value)}
                    />
                  </div>
                </Section>
              )}

              <Section>
                <div className="grid grid-cols-2 gap-3 min-[860px]:grid-cols-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">等级</Label>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{setup.level}</span>
                    </div>
                    <Slider
                      value={setup.level}
                      min={1}
                      max={MAX_LEVEL}
                      step={1}
                      aria-label="等级"
                      onValueChange={(v) => onSetupChange({ ...setup, level: v })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">星级</Label>
                    <StarRating value={setup.stars} onChange={(v) => onSetupChange({ ...setup, stars: v })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">属性</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sprite.elements.map((el) => {
                        const def = catalog.elements.find((e) => e.name === el);
                        return (
                          <span key={el} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
                            {def?.icon ? <Image src={def.icon} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : null}
                            {def?.nameZh ?? el}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      血脉
                      <span className="ml-1 text-muted-foreground">
                        {bloodlines.find((b) => b.id === effectiveBloodline)?.label ?? ""}
                      </span>
                    </Label>
                    <BloodlinePicker
                      options={bloodlines}
                      value={effectiveBloodline}
                      onChange={(id) => onSetupChange({ ...setup, bloodline: id })}
                    />
                  </div>
                </div>
              </Section>

              <Section>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    捕捉球
                    <span className="ml-1 text-muted-foreground">{ballOptionOf(effectiveBall)?.label ?? ""}</span>
                  </Label>
                  <BallPicker value={effectiveBall} onChange={(id) => onSetupChange({ ...setup, ball: id })} />
                </div>
              </Section>

              <Section>
                <NaturePicker
                  catalog={catalog}
                  value={setup.nature}
                  onChange={(nature) => onSetupChange({ ...setup, nature })}
                />
              </Section>

              <Section>
                <div className="grid gap-3 min-[860px]:grid-cols-2 min-[860px]:gap-4">
                  <div className="rounded-md border bg-background/60 p-1">
                    {panel ? (
                      <StatRadar panel={panel} baseline={baseline} className="h-[260px] w-full" />
                    ) : (
                      <p className="p-3 text-xs text-muted-foreground">缺少面板数据。</p>
                    )}
                  </div>
                  <InvestEditor setup={setup} panel={panel} race={sprite.race} onChange={onSetupChange} />
                </div>
              </Section>

              {showSkills && (
                <Section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">
                      出战技能
                      <span className="ml-2 text-muted-foreground">{setup.skills.length}/4</span>
                    </Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSkillOpen((v) => !v)}>
                      {skillOpen ? "收起" : "选择技能"}
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
                            <span className="truncate">{skill ? skill.name : `槽 ${i + 1}`}</span>
                            {skill ? (
                              <span className="flex shrink-0 items-center gap-1 text-[10px] opacity-70">
                                <SkillCategoryIcon skill={skill} size={13} />
                                <ElementIcon catalog={catalog} element={skill.element} size={13} />
                                {`能耗${skill.cost}`}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] opacity-70">选技能</span>
                            )}
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
                      bloodline={effectiveBloodline}
                      value={setup.skills[slot]}
                      onSelect={(skillId) => {
                        const next = [...setup.skills];
                        next[slot] = skillId;
                        onSetupChange({ ...setup, skills: [...new Set(next.filter(Boolean))].slice(0, 4) });
                      }}
                    />
                  )}
                </Section>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {sprite && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mr-auto"
              onClick={() => {
                const rec = recommendBuild(catalog, { spriteId, stars: setup.stars, nature: setup.nature });
                onSetupChange({ ...setup, nature: rec.nature, talent: rec.talent });
              }}
            >
              一键推荐
            </Button>
          )}
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
