"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { PetConfigDialog } from "@/components/pet-config-dialog";
import { PetSelector } from "@/components/pet-selector";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCatalog } from "@/modules/battle/client";
import type { Catalog } from "@/modules/battle/types";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import { computeStats, type StatKey } from "@/modules/engine/stats";
import {
  bloodlineOptionOf,
  defaultBloodline,
  newInstance,
  resolveInstance,
  type InstanceIssue,
  type PetInstance,
  type TalentMap,
} from "./instance";
import { deletePet, exportPets, importPets, listPets, upsertPet } from "./store";

function issueLabel(issue: InstanceIssue): string {
  switch (issue.kind) {
    case "orphan-sprite":
      return `模板已不存在（${issue.spriteId}）`;
    case "unknown-skill":
      return `技能不存在：${issue.skillId}`;
    case "skill-not-learnable":
      return `不在技能池：${issue.skillId}`;
    case "too-many-talents":
      return `加点超限 ${issue.count}/${issue.max}`;
    case "too-many-skills":
      return `出战超限 ${issue.count}`;
  }
}

function PetCard({
  catalog,
  instance,
  onEdit,
  onDelete,
}: {
  catalog: Catalog;
  instance: PetInstance;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const resolved = resolveInstance(catalog, instance);
  const sprite = resolved.sprite;
  const panel = sprite && catalog.stats ? computeStats(catalog.stats, { race: sprite.race }, resolved.profile) : null;
  const nature = (catalog.stats?.natures ?? []).find((n) => n.id === instance.nature);
  const bloodline = bloodlineOptionOf(catalog, instance.bloodline || defaultBloodline(catalog, instance.spriteId));
  const invested = PANEL_ORDER.filter((k) => instance.talent[k] != null).length;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <SpriteImage sprite={sprite ?? undefined} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">
              {instance.name?.trim() || (sprite ? `#${sprite.no} ${sprite.name}` : instance.spriteId)}
            </p>
            {sprite && instance.name?.trim() ? (
              <p className="truncate text-xs text-muted-foreground">#{sprite.no} {sprite.name}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline">{instance.level} 级</Badge>
              <Badge variant="outline">{instance.stars}★</Badge>
              <Badge variant="outline">
                {nature ? (nature.nameZh ?? nature.name ?? nature.id) : "中性"}
                {nature?.up ? ` · ${STAT_LABEL[nature.up as StatKey]}↑` : ""}
                {nature?.down ? ` · ${STAT_LABEL[nature.down as StatKey]}↓` : ""}
              </Badge>
              <Badge variant="outline">三维 {invested}</Badge>
              {bloodline ? (
                <Badge variant="outline" className="gap-1">
                  {bloodline.icon ? (
                    <Image src={bloodline.icon} alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                  ) : null}
                  {bloodline.label}
                </Badge>
              ) : null}
              <Badge variant="outline">技能 {resolved.loadout.length || "默认"}</Badge>
            </div>
          </div>
        </div>

        {instance.note && <p className="text-xs text-muted-foreground">{instance.note}</p>}

        {resolved.issues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {resolved.issues.map((issue, i) => (
              <Badge key={i} variant="destructive">
                {issueLabel(issue)}
              </Badge>
            ))}
          </div>
        )}

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

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            配置
          </Button>
          {confirming ? (
            <>
              <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
                确认删除
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                取消
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              删除
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function Warehouse() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pets, setPets] = useState<PetInstance[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<PetInstance | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getCatalog()
      .then((c) => {
        setCatalog(c);
        setPets(listPets());
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function refresh() {
    setPets(listPets());
  }

  function createInstance(spriteId: string) {
    const instance = { ...newInstance(spriteId), bloodline: catalog ? defaultBloodline(catalog, spriteId) : undefined };
    upsertPet(instance);
    refresh();
    setPickerOpen(false);
    setEditing(instance);
  }

  function commitEdit(instance: PetInstance) {
    const next = { ...instance, updatedAt: Date.now() };
    upsertPet(next);
    refresh();
  }

  function handleExport() {
    try {
      const blob = new Blob([exportPets()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "roco-pets.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("导出失败");
    }
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const { added, skipped } = importPets(text);
      refresh();
      toast.success(`导入完成：新增 ${added}，跳过 ${skipped}`);
    } catch {
      toast.error("导入失败：文件不是合法 JSON");
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">数据加载失败</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  if (!catalog) return <p className="text-sm text-muted-foreground">正在加载图鉴数据…</p>;

  const editingSetup = editing && {
    level: editing.level,
    stars: editing.stars,
    nature: editing.nature,
    bloodline: editing.bloodline,
    talent: editing.talent as TalentMap,
    skills: editing.skills,
  };

  return (
    <div className="space-y-3">
      <PageHeader title="精灵仓库" description="手动登记的精灵：绑定图鉴模板（外键），面板与技能数值运行时现算，图鉴换版自动跟随。" />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="tnum">精灵 {pets.length}</Badge>
        <Badge variant="outline" className="tnum">图鉴 {catalog.dataVersion}</Badge>
        <div className="flex flex-wrap gap-2 min-[520px]:ml-auto">
          <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
            新增精灵
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleExport} disabled={pets.length === 0}>
            导出
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            导入
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {pets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm text-muted-foreground">
            仓库还是空的。点「新增精灵」先选一只，再配置等级 / 星级 / 性格 / 加点 / 出战技能。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 min-[860px]:grid-cols-2">
          {pets.map((pet) => (
            <PetCard
              key={pet.id}
              catalog={catalog}
              instance={pet}
              onEdit={() => setEditing(pet)}
              onDelete={() => {
                deletePet(pet.id);
                refresh();
                toast.success("已删除精灵");
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="text-base">选择精灵（模板）</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <PetSelector catalog={catalog} onSelect={(spriteId) => createInstance(spriteId)} />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {editing && editingSetup && (
        <PetConfigDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) {
              commitEdit(editing);
              setEditing(null);
            }
          }}
          catalog={catalog}
          spriteId={editing.spriteId}
          setup={editingSetup}
          onSetupChange={(setup) => setEditing({ ...editing, ...setup })}
          name={editing.name ?? ""}
          onNameChange={(name) => setEditing({ ...editing, name })}
          title="精灵配置"
        />
      )}
    </div>
  );
}
