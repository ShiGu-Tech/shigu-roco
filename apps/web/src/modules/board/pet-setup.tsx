"use client";

import { useState } from "react";
import { toast } from "sonner";

import { PetConfigDialog } from "@/components/pet-config-dialog";
import { PetSelectorDialog } from "@/components/pet-selector-dialog";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import { computeStats, type StatKey } from "@/modules/engine/stats";
import { MAX_INVEST, profileFromSetup } from "@/modules/battle/pet";
import type { Catalog, CatalogSprite } from "@/modules/battle/types";
import { instanceFromSetup, setupFromInstance, type PetInstance } from "@/modules/pets/instance";
import { listPets, upsertPet } from "@/modules/pets/store";
import { LineupBar } from "./lineup-bar";
import type { LineupScope } from "./lineups";
import { emptySetup, spriteOf, type PetSetup, type TeamEntry } from "./util";

/** 已明确资质的摘要 + 面板速览；编辑走通用弹窗 PetConfigDialog。 */
function SetupSummary({
  catalog,
  spriteId,
  setup,
  onChange,
}: {
  catalog: Catalog;
  spriteId: string;
  setup: PetSetup;
  onChange: (setup: PetSetup) => void;
}) {
  const [open, setOpen] = useState(false);
  const sprite: CatalogSprite | undefined = spriteOf(catalog, spriteId);
  const panel = sprite && catalog.stats ? computeStats(catalog.stats, { race: sprite.race }, profileFromSetup(setup)) : null;
  const nature = (catalog.stats?.natures ?? []).find((n) => n.id === setup.nature);
  const invested = PANEL_ORDER.filter((k) => setup.talent[k] != null).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{setup.level} 级</Badge>
        <Badge variant="outline">{setup.stars}★</Badge>
        <Badge variant="outline">
          {nature ? (nature.nameZh ?? nature.name ?? nature.id) : "中性"}
          {nature?.up ? ` · ${STAT_LABEL[nature.up as StatKey]}↑` : ""}
          {nature?.down ? ` · ${STAT_LABEL[nature.down as StatKey]}↓` : ""}
        </Badge>
        <Badge variant="outline">
          三维 {invested}/{MAX_INVEST}
        </Badge>
        <Badge variant="outline">技能 {setup.skills.length || "默认"}</Badge>
        <div className="flex w-full gap-1.5 min-[520px]:ml-auto min-[520px]:w-auto">
          <Button type="button" size="sm" variant="outline" className="flex-1 min-[520px]:flex-none" onClick={() => {
            upsertPet(instanceFromSetup(spriteId, setup));
            toast.success("已存入精灵仓库");
          }}>
            存到仓库
          </Button>
          <Button type="button" size="sm" variant="secondary" className="flex-1 min-[520px]:flex-none" onClick={() => setOpen(true)}>
            配置参数
          </Button>
        </div>
      </div>

      {panel && (
        <div className="grid grid-cols-3 gap-1.5 min-[520px]:grid-cols-6">
          {PANEL_ORDER.map((key) => (
            <div key={key} className="rounded-md border bg-muted/40 p-1.5 text-center">
              <div className="text-[10px] text-muted-foreground">{STAT_LABEL[key]}</div>
              <div className="text-sm font-semibold tabular-nums">{panel[key]}</div>
            </div>
          ))}
        </div>
      )}

      <PetConfigDialog
        open={open}
        onOpenChange={setOpen}
        catalog={catalog}
        spriteId={spriteId}
        setup={setup}
        onSetupChange={onChange}
      />
    </div>
  );
}

/** 单个队伍条目：上行是「首发标记 + 头像 + 选择按钮 + 删除」，选择器与参数区在下方整宽展开。 */
function EntryRow({
  index,
  entry,
  catalog,
  editable,
  skillsUnknown,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  entry: TeamEntry;
  catalog: Catalog;
  editable: boolean;
  skillsUnknown: boolean;
  canRemove: boolean;
  onChange: (entry: TeamEntry) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sprite = spriteOf(catalog, entry.spriteId);

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground min-[520px]:w-11">
          {index === 0 ? "首发" : `替补${index}`}
        </span>
        <SpriteImage sprite={sprite} size="sm" className="h-10 w-10 rounded-lg min-[520px]:h-12 min-[520px]:w-12" />
        <Button
          type="button"
          variant="outline"
          className="min-w-0 flex-1 justify-between gap-2 font-normal"
          onClick={() => setPickerOpen(true)}
        >
          <span className="truncate">{sprite ? `#${sprite.no} ${sprite.name}` : "— 选择精灵 —"}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">选择</span>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`移除第 ${index + 1} 个精灵`}
        >
          <span aria-hidden="true">×</span>
        </Button>
      </div>

      <PetSelectorDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        catalog={catalog}
        value={entry.spriteId}
        onSelect={(spriteId) => onChange({ ...entry, spriteId })}
      />

      {editable && entry.setup && sprite ? (
        <SetupSummary
          catalog={catalog}
          spriteId={entry.spriteId}
          setup={entry.setup}
          onChange={(setup) => onChange({ ...entry, setup })}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {!sprite
            ? "未选择精灵。"
            : skillsUnknown
              ? "资质 / 性格 / 技能未知，按中性 5★·60 级估算。"
              : "资质 / 技能未录，按引擎默认估算。"}
        </p>
      )}
    </div>
  );
}

export function TeamEditor({
  title,
  scope,
  entries,
  catalog,
  editable,
  skillsUnknown = false,
  onChange,
}: {
  title: string;
  scope: LineupScope;
  entries: TeamEntry[];
  catalog: Catalog;
  editable: boolean;
  /** 我方 = false；对方 = true（技能未知，引擎按默认 4 招估算，界面不展示为已知）。 */
  skillsUnknown?: boolean;
  onChange: (entries: TeamEntry[]) => void;
}) {
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [pets, setPets] = useState<PetInstance[]>([]);

  function openWarehouse() {
    setPets(listPets());
    setWarehouseOpen(true);
  }

  function addEntry(): TeamEntry {
    return {
      spriteId: catalog.sprites[0]?.id ?? "",
      ...(editable ? { setup: emptySetup() } : {}),
      ...(skillsUnknown ? { skillsUnknown: true } : {}),
    };
  }

  function pickFromWarehouse(pet: PetInstance) {
    if (entries.length >= 6) return;
    onChange([...entries, { spriteId: pet.spriteId, setup: setupFromInstance(pet), instanceId: pet.id }]);
    setWarehouseOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 pb-3 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {title}
          <Badge variant="outline">{editable ? "资质 / 技能已知" : "只知精灵"}</Badge>
        </CardTitle>
        <div className="flex w-full gap-2 min-[520px]:w-auto">
          {editable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 min-[520px]:flex-none"
              disabled={entries.length >= 6}
              onClick={openWarehouse}
            >
              从仓库选
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1 min-[520px]:flex-none"
            disabled={entries.length >= 6}
            onClick={() => onChange([...entries, addEntry()])}
          >
            加精灵
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <LineupBar scope={scope} entries={entries} onApply={onChange} />
        {entries.length === 0 && <p className="text-xs text-muted-foreground">还没有精灵。</p>}
        {entries.map((entry, i) => (
          <EntryRow
            key={`${entry.spriteId}-${i}`}
            index={i}
            entry={entry}
            catalog={catalog}
            editable={editable}
            skillsUnknown={skillsUnknown}
            canRemove={entries.length > 1}
            onChange={(next) => onChange(entries.map((e, j) => (j === i ? next : e)))}
            onRemove={() => onChange(entries.filter((_, j) => j !== i))}
          />
        ))}
      </CardContent>

      <Dialog open={warehouseOpen} onOpenChange={setWarehouseOpen}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="text-base">从精灵仓库选择精灵</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2">
            {pets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                仓库为空。可先「加精灵」现场配置，再点「存到仓库」；或在精灵仓库页登记精灵。
              </p>
            )}
            {pets.map((pet) => {
              const sprite = spriteOf(catalog, pet.spriteId);
              return (
                <button
                  key={pet.id}
                  type="button"
                  onClick={() => pickFromWarehouse(pet)}
                  className="flex w-full items-center gap-3 rounded-md border p-2 text-left hover:bg-accent"
                >
                  <SpriteImage sprite={sprite} size="sm" className="h-11 w-11 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {sprite ? `#${sprite.no} ${sprite.name}` : pet.spriteId}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{pet.level} 级</Badge>
                      <Badge variant="outline">{pet.stars}★</Badge>
                      <Badge variant="outline">技能 {pet.skills.length || "默认"}</Badge>
                    </span>
                  </span>
                </button>
              );
            })}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
