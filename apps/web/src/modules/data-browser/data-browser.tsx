"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { ElementBadge } from "@/components/element-icon";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SkillCategoryIcon } from "@/components/skill-category-icon";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { getCatalog } from "@/modules/battle/client";
import type { Catalog, CatalogSkill, CatalogSprite } from "@/modules/battle/types";

type Tab = "sprites" | "skills" | "elements" | "effects";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "sprites", label: "精灵" },
  { id: "skills", label: "技能" },
  { id: "elements", label: "属性" },
  { id: "effects", label: "印记 / 天气" },
];

const TH = "h-9 whitespace-nowrap px-3 text-left font-medium text-muted-foreground";
const TD = "px-3 py-2 align-middle";
const TR = "border-b last:border-0 hover:bg-muted/40";

const RACE_COLS: Array<[string, keyof CatalogSprite["race"]]> = [
  ["HP", "hp"],
  ["物攻", "atk"],
  ["物防", "defense"],
  ["魔攻", "spatk"],
  ["魔防", "spdef"],
  ["速度", "speed"],
];

function SpritesTable({ sprites, catalog }: { sprites: CatalogSprite[]; catalog: Catalog }) {
  return (
    <table className="w-full min-w-[900px] border-collapse text-[13px]">
      <thead>
        <tr className="border-b">
          <th className={TH}>精灵</th>
          <th className={TH}>属性</th>
          <th className={cn(TH, "text-right")}>阶段</th>
          {RACE_COLS.map(([label]) => (
            <th key={label} className={cn(TH, "text-right")}>
              {label}
            </th>
          ))}
          <th className={TH}>特性</th>
        </tr>
      </thead>
      <tbody>
        {sprites.map((sprite) => (
          <tr key={sprite.id} className={TR}>
            <td className={TD}>
              <div className="flex items-center gap-2">
                <SpriteImage sprite={sprite} size="sm" className="h-8 w-8 shrink-0 rounded-sm" />
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {sprite.name}
                    {sprite.form ? <span className="ml-1 text-muted-foreground">{sprite.form}</span> : null}
                  </div>
                  <div className="tnum font-mono text-[11px] text-muted-foreground">#{sprite.no}</div>
                </div>
              </div>
            </td>
            <td className={TD}>
              <div className="flex flex-wrap gap-1">
                {sprite.elements.map((element) => (
                  <ElementBadge key={element} catalog={catalog} element={element} />
                ))}
              </div>
            </td>
            <td className={cn(TD, "tnum text-right")}>{sprite.stage}</td>
            {RACE_COLS.map(([label, key]) => (
              <td key={label} className={cn(TD, "tnum text-right font-medium")}>
                {sprite.race[key] ?? "-"}
              </td>
            ))}
            <td className={TD}>
              {sprite.trait?.name ? (
                <span title={sprite.trait.desc} className="font-medium">
                  {sprite.trait.name}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SkillsTable({ skills, catalog }: { skills: CatalogSkill[]; catalog: Catalog }) {
  return (
    <table className="w-full min-w-[820px] border-collapse text-[13px]">
      <thead>
        <tr className="border-b">
          <th className={TH}>技能</th>
          <th className={TH}>属性</th>
          <th className={TH}>类别</th>
          <th className={cn(TH, "text-right")}>威力</th>
          <th className={cn(TH, "text-right")}>能耗</th>
          <th className={cn(TH, "text-right")}>优先级</th>
          <th className={TH}>说明</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((skill) => (
          <tr key={skill.id} className={TR}>
            <td className={TD}>
              <div className="flex items-center gap-2">
                {skill.icon ? (
                  <Image src={skill.icon} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-sm border bg-muted object-contain" />
                ) : (
                  <span className="h-7 w-7 shrink-0 rounded-sm border bg-muted" />
                )}
                <span className="font-medium">{skill.name}</span>
              </div>
            </td>
            <td className={TD}>
              <ElementBadge catalog={catalog} element={skill.element} />
            </td>
            <td className={TD}>
              <span className="inline-flex items-center gap-1.5">
                <SkillCategoryIcon skill={skill} size={14} />
                {skill.categoryZh ?? skill.category}
              </span>
            </td>
            <td className={cn(TD, "tnum text-right font-medium")}>{skill.power || "-"}</td>
            <td className={cn(TD, "tnum text-right")}>{skill.cost}</td>
            <td className={cn(TD, "tnum text-right")}>{skill.priority}</td>
            <td className={cn(TD, "max-w-[420px] text-muted-foreground")}>{skill.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DataBrowser() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState<Tab>("sprites");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog().then(setCatalog).catch((err: Error) => setError(err.message));
  }, []);

  const filteredSprites = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!catalog || !value) return catalog?.sprites ?? [];
    return catalog.sprites.filter((sprite) => `${sprite.name} ${sprite.nameZh ?? ""} ${sprite.elements.join(" ")}`.toLowerCase().includes(value));
  }, [catalog, query]);

  const filteredSkills = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!catalog || !value) return catalog?.allSkills ?? [];
    return catalog.allSkills.filter((skill) => `${skill.name} ${skill.nameZh ?? ""} ${skill.elementZh ?? ""} ${skill.categoryZh ?? ""}`.toLowerCase().includes(value));
  }, [catalog, query]);

  if (error) {
    return <Panel title="基础数据">{<p className="text-[13px] text-destructive">数据目录加载失败：{error}</p>}</Panel>;
  }
  if (!catalog) {
    return <p className="text-[13px] text-muted-foreground">正在加载基础数据…</p>;
  }

  const empty = catalog.sprites.length === 0 && catalog.allSkills.length === 0;

  return (
    <>
      <PageHeader
        title="基础数据"
        description="当前运行时已注册的精灵、技能与战斗资源。"
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="tnum">版本 {catalog.dataVersion}</Badge>
            <Badge variant="outline" className="tnum">精灵 {catalog.sprites.length}</Badge>
            <Badge variant="outline" className="tnum">技能 {catalog.allSkills.length}</Badge>
            <Badge variant="outline" className="tnum">属性 {catalog.elements.length}</Badge>
            <Badge variant="outline" className="tnum">印记 {catalog.marks.length}</Badge>
            <Badge variant="outline" className="tnum">天气 {catalog.weather.length}</Badge>
          </div>
        }
      />

      {empty ? (
        <Panel title="无已注册数据">
          <p className="text-[13px] text-muted-foreground">启动服务后通过注册接口导入图鉴快照，注册完成后刷新本页即可查看。</p>
        </Panel>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center">
            <div className="flex gap-0.5 rounded-md border bg-muted/30 p-0.5">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "shrink-0 rounded-sm px-3 py-1.5 text-[13px] transition-colors",
                    tab === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Input
              className="h-9 min-[520px]:ml-auto min-[520px]:max-w-xs"
              placeholder="搜索名称、属性、类别…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <Panel bodyClassName="p-0" dense>
            <div className="overflow-x-auto">
              {tab === "sprites" && <SpritesTable sprites={filteredSprites} catalog={catalog} />}
              {tab === "skills" && <SkillsTable skills={filteredSkills} catalog={catalog} />}
              {tab === "elements" && (
                <table className="w-full min-w-[480px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b">
                      <th className={TH}>属性</th>
                      <th className={TH}>全称</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.elements.map((element) => (
                      <tr key={element.name} className={TR}>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-2">
                            {element.icon ? <Image src={element.icon} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : null}
                            <span className="font-medium">{element.nameZh ?? element.name}</span>
                          </span>
                        </td>
                        <td className={cn(TD, "text-muted-foreground")}>{element.nameFullZh ?? `${element.nameZh ?? element.name}系`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === "effects" && (
                <div className="grid gap-0 min-[860px]:grid-cols-2">
                  <div className="min-[860px]:border-r">
                    <div className="border-b bg-muted/40 px-3 py-2 text-[12px] font-semibold text-muted-foreground">印记</div>
                    {catalog.marks.map((mark) => (
                      <div key={mark.id} className="border-b px-3 py-2 last:border-0">
                        <div className="font-medium">{mark.nameZh ?? mark.name}</div>
                        {mark.description ? <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{mark.description}</p> : null}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="border-b bg-muted/40 px-3 py-2 text-[12px] font-semibold text-muted-foreground">天气</div>
                    {catalog.weather.map((weather) => (
                      <div key={weather.id} className="border-b px-3 py-2 last:border-0">
                        <div className="font-medium">{weather.nameZh ?? weather.name}</div>
                        {weather.description ? <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{weather.description}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
