"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { getCatalog, recommend } from "./client";
import { ResultPanel } from "./result-panel";
import { activeFromSprite, createInitialState } from "./state";
import {
  deleteSave,
  listSaves,
  loadOpponentLibrary,
  loadOpponentModel,
  recordOpponentAction,
  recordOpponentTraining,
  saveOpponentLibrary,
  saveOpponentModel,
  saveState,
  type OpponentLibrary,
  type SaveEntry,
} from "./storage";
import type { ActiveSpriteState, BattleState, Catalog, CatalogSprite, RecommendResult } from "./types";
import { maxHpFromRace } from "@/modules/engine/stats";
import type { StatsData } from "@/modules/engine/types";

const PRESETS = {
  fast: { label: "快速 0.3s", maxIterations: 400, timeLimitMs: 300 },
  standard: { label: "标准 1.5s", maxIterations: 1000, timeLimitMs: 1500 },
  deep: { label: "深入 3s", maxIterations: 2500, timeLimitMs: 3000 },
} as const;

type PresetKey = keyof typeof PRESETS;

function SpriteSelect({
  value,
  sprites,
  onChange,
}: {
  value: string;
  sprites: CatalogSprite[];
  onChange: (id: string) => void;
}) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— 选择精灵 —</option>
      {sprites.map((s) => (
        <option key={s.id} value={s.id}>
          #{s.no} {s.name}
          {s.nameZh ? ` · ${s.nameZh}` : ""} [{s.elements.join("/")}]
        </option>
      ))}
    </NativeSelect>
  );
}

function MarksEditor({
  active,
  catalog,
  onChange,
}: {
  active: ActiveSpriteState;
  catalog: Catalog;
  onChange: (marks: Record<string, number>) => void;
}) {
  const [markId, setMarkId] = useState(catalog.marks[0]?.id ?? "");
  const [stack, setStack] = useState(1);

  function add() {
    if (!markId) return;
    onChange({ ...active.marks, [markId]: (active.marks[markId] ?? 0) + stack });
  }

  return (
    <div className="space-y-2">
      <Label>印记</Label>
      <div className="flex flex-wrap gap-1">
        {Object.entries(active.marks).map(([id, n]) => (
          <Badge key={id} variant="outline">
            {id} × {n}
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-destructive"
              onClick={() => {
                const next = { ...active.marks };
                delete next[id];
                onChange(next);
              }}
            >
              ×
            </button>
          </Badge>
        ))}
        {Object.keys(active.marks).length === 0 && <span className="text-xs text-muted-foreground">无</span>}
      </div>
      <div className="flex gap-2">
        <NativeSelect value={markId} onChange={(e) => setMarkId(e.target.value)} className="flex-1">
          {catalog.marks.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}（上限 {m.maxStack}）
            </option>
          ))}
        </NativeSelect>
        <Input
          type="number"
          value={stack}
          min={1}
          onChange={(e) => setStack(Number(e.target.value))}
          className="w-20"
        />
        <Button type="button" variant="secondary" onClick={add}>
          添加
        </Button>
      </div>
    </div>
  );
}

const PANEL_LABEL: Record<string, string> = { hp: "体力", atk: "攻击", defense: "防御" };

function TrainingEditor({
  active,
  sprite,
  catalog,
  onChange,
}: {
  active: ActiveSpriteState;
  sprite?: CatalogSprite;
  catalog: Catalog;
  onChange: (mutate: (a: ActiveSpriteState) => void) => void;
}) {
  const stats = catalog.stats as StatsData | undefined;
  const natures = catalog.stats?.natures ?? [];
  const panels = (catalog.stats?.training as { panels?: string[] } | undefined)?.panels ?? ["hp", "atk", "defense"];
  if (!sprite || !stats) return null;

  const recompute = (a: ActiveSpriteState) => {
    a.maxHp = maxHpFromRace(stats, sprite.race, a.profile);
    if (a.hp > a.maxHp) a.hp = a.maxHp;
  };

  return (
    <div className="space-y-2">
      <Label>养成资质（性格 + 三维）</Label>
      <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
        <div className="col-span-2 space-y-1 min-[520px]:col-span-1">
          <Label className="text-xs text-muted-foreground">性格</Label>
          <NativeSelect
            value={active.profile?.nature ?? ""}
            onChange={(e) =>
              onChange((a) => {
                a.profile = { ...a.profile, nature: e.target.value || null };
                recompute(a);
              })
            }
          >
            <option value="">未设</option>
            {natures.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nameZh ?? n.name ?? n.id}
              </option>
            ))}
          </NativeSelect>
        </div>
        {panels.map((panel) => (
          <div key={panel} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{PANEL_LABEL[panel] ?? panel}</Label>
            <Input
              type="number"
              min={0}
              value={active.profile?.training?.[panel as "hp" | "atk" | "defense"] ?? 0}
              onChange={(e) =>
                onChange((a) => {
                  a.profile = {
                    ...a.profile,
                    training: { ...a.profile?.training, [panel]: Number(e.target.value) },
                  };
                  recompute(a);
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveCard({
  title,
  subtitle,
  active,
  catalog,
  onChange,
}: {
  title: string;
  subtitle?: string;
  active: ActiveSpriteState;
  catalog: Catalog;
  onChange: (mutate: (a: ActiveSpriteState) => void) => void;
}) {
  const sprite = catalog.sprites.find((s) => s.id === active.spriteId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          {subtitle && <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SpriteSelect
          value={active.spriteId}
          sprites={catalog.sprites}
          onChange={(id) => {
            const sp = catalog.sprites.find((s) => s.id === id);
            onChange((a) => {
              const fresh = sp ? activeFromSprite(sp) : active;
              Object.assign(a, fresh);
            });
          }}
        />
        {sprite && (
          <p className="text-xs text-muted-foreground">
            种族 hp{sprite.race.hp}/atk{sprite.race.atk}/def{sprite.race.defense}/spa{sprite.race.spatk}/spd{sprite.race.spdef}/spe{sprite.race.speed}
            {sprite.trait?.name ? ` · 特性 ${sprite.trait.name}` : ""}
          </p>
        )}
        <TrainingEditor active={active} sprite={sprite} catalog={catalog} onChange={onChange} />
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label>当前 HP</Label>
            <Input
              type="number"
              value={active.hp}
              onChange={(e) => onChange((a) => void (a.hp = Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1">
            <Label>最大 HP</Label>
            <Input
              type="number"
              value={active.maxHp}
              onChange={(e) => onChange((a) => void (a.maxHp = Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1">
            <Label>能量</Label>
            <Input
              type="number"
              value={active.energy}
              onChange={(e) => onChange((a) => void (a.energy = Number(e.target.value)))}
            />
          </div>
        </div>
        <MarksEditor active={active} catalog={catalog} onChange={(marks) => onChange((a) => void (a.marks = marks))} />
      </CardContent>
    </Card>
  );
}

export function BattleWorkbench() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [state, setState] = useState<BattleState | null>(null);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("standard");
  const [saves, setSaves] = useState<SaveEntry[]>(() => listSaves());
  const [saveName, setSaveName] = useState("");
  const [opponent, setOpponent] = useState<Record<string, number>>(() => loadOpponentModel());
  const [library, setLibrary] = useState<OpponentLibrary>(() => loadOpponentLibrary());
  const [trainingProfile, setTrainingProfile] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog()
      .then((c) => {
        setCatalog(c);
        setState(createInitialState(c));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const patch = useMemo(
    () => (mutate: (draft: BattleState) => void) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        mutate(next);
        return next;
      });
    },
    [],
  );

  async function run() {
    if (!state) return;
    setBusy(true);
    try {
      const opts = PRESETS[preset];
      const r = await recommend(state, {
        maxIterations: opts.maxIterations,
        timeLimitMs: opts.timeLimitMs,
        explorationC: 1.414,
        rolloutMaxTurns: 12,
        seed: state.seed,
        opponentModel: opponent,
        opponentLibrary: library as unknown as Record<string, unknown>,
      });
      setResult(r);
      toast.success(`推演完成：${r.meta.iterations} 次模拟 / ${r.meta.elapsedMs}ms`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function doSave() {
    if (!state) return;
    const name = saveName.trim() || `对局 ${new Date().toLocaleString()}`;
    setSaves(saveState(name, state));
    setSaveName("");
    toast.success("已保存到本地");
  }

  function observe(cls: "A" | "D" | "S") {
    const next = { ...opponent, [cls]: (opponent[cls] ?? 0) + 1 };
    setOpponent(next);
    saveOpponentModel(next);
    const enemyId = state?.enemy.active.spriteId;
    if (enemyId) {
      const lib = recordOpponentAction(library, enemyId, cls);
      setLibrary(lib);
      saveOpponentLibrary(lib);
      toast.success(`已记录 ${enemyId} 动作：${cls}`);
    } else {
      toast.success(`已记录对手动作：${cls}`);
    }
  }

  function recordTraining() {
    const enemyId = state?.enemy.active.spriteId;
    if (!enemyId || !trainingProfile) return;
    const lib = recordOpponentTraining(library, enemyId, trainingProfile);
    setLibrary(lib);
    saveOpponentLibrary(lib);
    toast.success(`已记录 ${enemyId} 养成：${trainingProfile}`);
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">引擎未就绪</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{error}</p>
          <p className="text-muted-foreground">
            请启动前端：<code className="rounded bg-muted px-1">pwsh scripts/dev.ps1</code>（内置 TS 引擎，127.0.0.1:26900）。
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!catalog || !state) {
    return <p className="text-sm text-muted-foreground">正在加载引擎数据…</p>;
  }

  const playerSprite = catalog.sprites.find((s) => s.id === state.player.active.spriteId) ?? catalog.sprites[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">数据版本 {catalog.dataVersion}</Badge>
        <Badge variant="outline">更新 {catalog.dataUpdatedAt}</Badge>
        <Badge variant="outline">精灵 {catalog.sprites.length}</Badge>
        {catalog.warnings.length > 0 && <Badge variant="destructive">警告 {catalog.warnings.length}</Badge>}
      </div>

      <div className="grid gap-4 min-[860px]:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>全局</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>我方魔力</Label>
                <Input
                  type="number"
                  value={state.player.magic}
                  onChange={(e) => patch((d) => void (d.player.magic = Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <Label>敌方魔力</Label>
                <Input
                  type="number"
                  value={state.enemy.magic}
                  onChange={(e) => patch((d) => void (d.enemy.magic = Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <Label>天气</Label>
                <NativeSelect
                  value={state.weather?.id ?? ""}
                  onChange={(e) =>
                    patch((d) => {
                      d.weather = e.target.value ? { id: e.target.value, turnsLeft: 5 } : null;
                    })
                  }
                >
                  <option value="">无</option>
                  {catalog.weather.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label>回合</Label>
                <Input
                  type="number"
                  value={state.turn}
                  onChange={(e) => patch((d) => void (d.turn = Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <Label>愿力剩余</Label>
                <Input
                  type="number"
                  value={state.player.wishChargesLeft}
                  onChange={(e) => patch((d) => void (d.player.wishChargesLeft = Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <Label>推演种子</Label>
                <Input
                  type="number"
                  value={state.seed}
                  onChange={(e) => patch((d) => void (d.seed = Number(e.target.value)))}
                />
              </div>
            </CardContent>
          </Card>

          <ActiveCard
            title="我方场上"
            subtitle="已知"
            active={state.player.active}
            catalog={catalog}
            onChange={(m) => patch((d) => m(d.player.active))}
          />
          <ActiveCard
            title="敌方场上"
            subtitle="推测 / 可观测"
            active={state.enemy.active}
            catalog={catalog}
            onChange={(m) => patch((d) => m(d.enemy.active))}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>我方背包</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    patch((d) => {
                      if (playerSprite) d.player.bench.push(activeFromSprite(playerSprite));
                    })
                  }
                >
                  添加
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {state.player.bench.length === 0 && (
                <p className="text-xs text-muted-foreground">无（推演时无法使用换人动作）</p>
              )}
              {state.player.bench.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <SpriteSelect
                      value={b.spriteId}
                      sprites={catalog.sprites}
                      onChange={(id) =>
                        patch((d) => {
                          const sp = catalog.sprites.find((s) => s.id === id);
                          if (sp) d.player.bench[i] = activeFromSprite(sp);
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => patch((d) => void d.player.bench.splice(i, 1))}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>推演设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={preset === k ? "default" : "outline"}
                    onClick={() => setPreset(k)}
                  >
                    {PRESETS[k].label}
                  </Button>
                ))}
              </div>
              <Button type="button" className="w-full" disabled={busy} onClick={run}>
                {busy ? "推演中…" : "推演"}
              </Button>
              <div className="space-y-1">
                <Label>记录对手上一回合动作（更新贝叶斯模型）</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => observe("A")}>
                    攻击 A ({opponent.A})
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => observe("D")}>
                    防御 D ({opponent.D})
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => observe("S")}>
                    状态 S ({opponent.S})
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>记录对手养成档位（写入对手库，随精灵累积）</Label>
                <div className="flex gap-2">
                  <NativeSelect
                    className="flex-1"
                    value={trainingProfile || catalog.stats?.trainingProfiles?.options?.[0]?.id || ""}
                    onChange={(e) => setTrainingProfile(e.target.value)}
                  >
                    {(catalog.stats?.trainingProfiles?.options ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label ?? p.id}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button type="button" size="sm" variant="secondary" onClick={recordTraining}>
                    记录
                  </Button>
                </div>
                {state.enemy.active.spriteId && (
                  <p className="text-xs text-muted-foreground">
                    对手库 {state.enemy.active.spriteId}：出招 A
                    {library.opponents[state.enemy.active.spriteId]?.actions.A ?? 0} / D
                    {library.opponents[state.enemy.active.spriteId]?.actions.D ?? 0} / S
                    {library.opponents[state.enemy.active.spriteId]?.actions.S ?? 0}
                    {library.opponents[state.enemy.active.spriteId]?.training &&
                      ` · 养成 ${JSON.stringify(library.opponents[state.enemy.active.spriteId].training)}`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <ResultPanel result={result} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>存档 / 复盘</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="存档名称"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                />
                <Button type="button" variant="secondary" onClick={doSave}>
                  保存
                </Button>
              </div>
              <div className="space-y-1">
                {saves.length === 0 && <p className="text-xs text-muted-foreground">暂无存档</p>}
                {saves.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() => {
                        setState(structuredClone(s.state));
                        toast.success(`已读取「${s.name}」`);
                      }}
                    >
                      {s.name}
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setSaves(deleteSave(s.id))}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
