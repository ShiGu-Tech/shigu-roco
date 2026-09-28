"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCatalog } from "@/modules/battle/client";
import type { Catalog, CatalogSkill, CatalogSprite } from "@/modules/battle/types";

type Tab = "sprites" | "skills" | "elements" | "effects";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "sprites", label: "精灵" },
  { id: "skills", label: "技能" },
  { id: "elements", label: "属性" },
  { id: "effects", label: "印记 / 天气" },
];

function SpriteRow({ sprite }: { sprite: CatalogSprite }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">#{sprite.no} {sprite.name}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sprite.elements.map((element) => <Badge key={element} variant="outline">{element}</Badge>)}
              <Badge variant="secondary">阶段 {sprite.stage}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs min-[520px]:grid-cols-6">
          {[["HP", sprite.race.hp], ["物攻", sprite.race.atk], ["物防", sprite.race.defense], ["魔攻", sprite.race.spatk], ["魔防", sprite.race.spdef], ["速度", sprite.race.speed]].map(([label, value]) => (
            <div key={String(label)} className="rounded-md bg-muted/60 px-2 py-1.5">
              <div className="text-muted-foreground">{label}</div>
              <div className="font-medium">{value ?? "-"}</div>
            </div>
          ))}
        </div>
        {sprite.trait?.name && (
          <div className="mt-3 border-t pt-3 text-sm">
            <span className="font-medium">特性：{sprite.trait.name}</span>
            <p className="mt-1 text-muted-foreground">{sprite.trait.desc || "暂无描述"}</p>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">技能 {sprite.skills.length} 个</p>
      </CardContent>
    </Card>
  );
}

function SkillRow({ skill }: { skill: CatalogSkill }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {skill.icon ? <Image src={skill.icon} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-md border bg-muted object-contain" /> : null}
            <div>
            <p className="font-semibold">{skill.name}</p>
            </div>
          </div>
          <Badge variant="outline">{skill.elementZh ?? skill.element}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{skill.categoryZh ?? skill.category}</span>
          <span>威力 {skill.power || "-"}</span>
          <span>能耗 {skill.cost}</span>
          <span>优先级 {skill.priority}</span>
        </div>
        {skill.description && <p className="mt-3 border-t pt-3 text-sm leading-6 text-muted-foreground">{skill.description}</p>}
      </CardContent>
    </Card>
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

  if (error) return <Card><CardContent className="p-6 text-sm text-destructive">数据目录加载失败：{error}</CardContent></Card>;
  if (!catalog) return <p className="text-sm text-muted-foreground">正在加载基础数据…</p>;

  const empty = catalog.sprites.length === 0 && catalog.allSkills.length === 0;
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-end min-[520px]:justify-between">
        <div className="space-y-2">
          <div className="eyebrow">Registered runtime data</div>
          <h1 className="text-2xl font-bold tracking-tight min-[520px]:text-3xl">基础数据</h1>
          <p className="text-sm text-muted-foreground">查看当前运行时已经注册的精灵、技能和战斗资源。</p>
        </div>
        <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">返回对战台</Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">版本 {catalog.dataVersion}</Badge>
        <Badge variant="outline">精灵 {catalog.sprites.length}</Badge>
        <Badge variant="outline">技能 {catalog.allSkills.length}</Badge>
        <Badge variant="outline">属性 {catalog.elements.length}</Badge>
        <Badge variant="outline">印记 {catalog.marks.length}</Badge>
        <Badge variant="outline">天气 {catalog.weather.length}</Badge>
      </div>

      {empty ? (
        <Card className="border-dashed">
          <CardHeader><CardTitle className="text-base">当前没有已注册的动态数据</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">启动服务后，通过注册接口导入图鉴快照；注册完成后刷新本页即可查看。</CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 min-[520px]:flex-row">
            <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
              {tabs.map((item) => <button key={item.id} type="button" className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${tab === item.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
            </div>
            <Input className="min-[520px]:ml-auto min-[520px]:max-w-xs" placeholder="搜索名称、ID、属性…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {tab === "sprites" && <div className="grid gap-3 min-[860px]:grid-cols-2">{filteredSprites.map((sprite) => <SpriteRow key={sprite.id} sprite={sprite} />)}</div>}
          {tab === "skills" && <div className="grid gap-3 min-[860px]:grid-cols-2">{filteredSkills.map((skill) => <SkillRow key={skill.id} skill={skill} />)}</div>}
          {tab === "elements" && <div className="grid gap-3 min-[520px]:grid-cols-2 min-[860px]:grid-cols-3">{catalog.elements.map((element) => <Card key={element.name}><CardContent className="flex items-center gap-3 p-4">{element.icon ? <Image src={element.icon} alt="" width={36} height={36} className="h-9 w-9 object-contain" /> : null}<div><p className="font-semibold">{element.nameZh ?? element.name}</p><p className="mt-1 text-sm text-muted-foreground">{element.nameFullZh ?? `${element.nameZh ?? element.name}系`}</p></div></CardContent></Card>)}</div>}
          {tab === "effects" && <div className="grid gap-3 min-[520px]:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">印记</CardTitle></CardHeader><CardContent className="space-y-3">{catalog.marks.map((mark) => <div key={mark.id} className="border-b pb-3 last:border-0 last:pb-0"><p className="font-medium">{mark.nameZh ?? mark.name}</p>{mark.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{mark.description}</p>}</div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">天气</CardTitle></CardHeader><CardContent className="space-y-3">{catalog.weather.map((weather) => <div key={weather.id} className="border-b pb-3 last:border-0 last:pb-0"><p className="font-medium">{weather.nameZh ?? weather.name}</p>{weather.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{weather.description}</p>}</div>)}</CardContent></Card></div>}
        </>
      )}
    </div>
  );
}
