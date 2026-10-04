"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { collectAtlasStep } from "@/modules/atlas/collect";
import { recordAtlasStep } from "@/modules/atlas/storage";
import { describeEvent } from "@/modules/board/log";
import { getCatalog } from "@/modules/battle/client";
import { SIDE_NAME } from "@/modules/battle/side-labels";
import type { BattleEvent, Catalog, CatalogSprite } from "@/modules/battle/types";
import { STAT_LABEL } from "@/modules/engine/calc";
import { parseState } from "@/modules/engine/api/handlers";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";
import type { Action, Dict } from "@/modules/engine/types";
import { workerRequest } from "@/modules/engine/worker/client";

import { createDebugSprite, toBattleState, toDebugState, type DebugSide, type DebugSprite, type DebugState } from "./debug-state";
import { MapEditor, type MapOption } from "./map-editor";

interface StepResult {
  state: Dict;
  log: BattleEvent[];
  phaseLogs: string[];
  terminal: { ended: boolean; winner: string | null; reason: string };
  legal: { player: Action[]; enemy: Action[] };
}

interface TraceRow {
  trigger: string;
  text: string;
  breakdown?: Dict;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  atk: "攻",
  dfn: "防",
  effectivePower: "战时威力",
  perHit: "单段",
  stageMult: "强化差",
  stab: "本系",
  typeMult: "克制",
  weatherMult: "天气",
  traitMult: "特性",
  extraMult: "附加",
  reduction: "减伤",
  hits: "连击",
  balance: "系数",
  damage: "总伤",
};

function actionLabel(action: Action, catalog: Catalog): string {
  if (action.label) return action.label;
  switch (action.kind) {
    case "skill":
      return `技能 · ${catalog.allSkills.find((s) => s.id === action.skillId)?.name ?? action.skillId ?? ""}`;
    case "switch":
      return `换人 · ${catalog.sprites.find((s) => s.id === action.benchId)?.name ?? action.benchId ?? ""}`;
    case "defend":
      return "防御";
    case "energy":
      return "聚能";
    case "wish":
      return "愿力魔法";
    case "leader":
      return "首领化";
    default:
      return action.kind;
  }
}

function rowsFromLog(log: BattleEvent[], catalog: Catalog): TraceRow[] {
  return log.map((event) => ({
    trigger: String((event.data as Dict)?.trigger ?? ""),
    text: describeEvent(event, catalog),
    breakdown: (event.data as Dict)?.breakdown as Dict | undefined,
  }));
}

function createInitial(catalog: Catalog): DebugState {
  const [a, b] = catalog.sprites;
  const other = catalog.sprites.find((s) => s.no !== a.no) ?? b ?? a;
  const build = (sprite: CatalogSprite, energy: number): DebugSprite =>
    createDebugSprite({
      spriteId: sprite.id,
      race: sprite.race,
      skillIds: sprite.skills.map((s) => s.id),
      stats: catalog.stats,
      energy,
    });
  const energy = Number((catalog.rules?.energy as Dict | undefined)?.initial ?? 10);
  return {
    turn: 1,
    seed: 42,
    weather: null,
    player: { magic: 4, active: build(a, energy), bench: [], teamMarks: {} },
    enemy: { magic: 4, active: build(other, energy), bench: [], teamMarks: {} },
  };
}

function spriteOptions(catalog: Catalog): MapOption[] {
  return catalog.sprites.map((sprite) => ({ id: sprite.id, name: sprite.name }));
}

function skillOptions(catalog: Catalog, sprite: DebugSprite): MapOption[] {
  const own = catalog.sprites.find((s) => s.id === sprite.spriteId)?.skills ?? [];
  return own.length ? own.map((s) => ({ id: s.id, name: s.name })) : catalog.allSkills.map((s) => ({ id: s.id, name: s.name }));
}

const STAT_OPTIONS: MapOption[] = Object.entries(STAT_LABEL).map(([id, name]) => ({ id, name: String(name) }));

// ---------------------------------------------------------------- 状态面板

function SidePanel({
  title,
  catalog,
  side,
  onChange,
}: {
  title: string;
  catalog: Catalog;
  side: DebugSide;
  onChange: (next: DebugSide) => void;
}) {
  const sprite = side.active;
  const setSprite = (next: Partial<DebugSprite>) => onChange({ ...side, active: { ...sprite, ...next } });
  const marks = catalog.marks.map((m) => ({ id: m.id, name: m.nameZh ?? m.name }));
  const statuses = catalog.statuses.map((s) => ({ id: s.id, name: s.nameZh ?? s.name }));

  return (
    <div className="space-y-2 rounded-md border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold">{title}</span>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          魔力
          <Input
            type="number"
            value={side.magic}
            onChange={(e) => onChange({ ...side, magic: Number(e.target.value) || 0 })}
            className="h-7 w-14 px-1.5 text-[11px] tnum"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="col-span-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          精灵
          <NativeSelect
            value={sprite.spriteId}
            onChange={(e) => {
              const picked = catalog.sprites.find((s) => s.id === e.target.value);
              if (picked) {
                onChange({
                  ...side,
                  active: createDebugSprite({
                    spriteId: picked.id,
                    race: picked.race,
                    skillIds: picked.skills.map((s) => s.id),
                    stats: catalog.stats,
                    energy: sprite.energy,
                  }),
                });
              }
            }}
            className="h-7 flex-1 px-1 text-[11px]"
          >
            {spriteOptions(catalog).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          HP
          <Input type="number" value={sprite.hp} onChange={(e) => setSprite({ hp: Number(e.target.value) || 0 })} className="h-7 w-full px-1.5 text-[11px] tnum" />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          上限
          <Input type="number" value={sprite.maxHp} onChange={(e) => setSprite({ maxHp: Number(e.target.value) || 1 })} className="h-7 w-full px-1.5 text-[11px] tnum" />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          能量
          <Input type="number" value={sprite.energy} onChange={(e) => setSprite({ energy: Number(e.target.value) || 0 })} className="h-7 w-full px-1.5 text-[11px] tnum" />
        </label>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">技能栏</div>
        {sprite.loadout.map((skillId, index) => (
          <NativeSelect
            key={index}
            value={skillId}
            onChange={(e) => {
              const loadout = [...sprite.loadout];
              loadout[index] = e.target.value;
              setSprite({ loadout });
            }}
            className="h-7 px-1 text-[11px]"
          >
            {skillOptions(catalog, sprite).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        ))}
      </div>

      <MapEditor label="印记" value={sprite.marks} onChange={(marks) => setSprite({ marks })} options={marks} keyPlaceholder="选择印记" />
      <MapEditor label="状态" value={sprite.statuses} onChange={(statuses) => setSprite({ statuses })} options={statuses} keyPlaceholder="选择状态" />
      <MapEditor label="增益" value={sprite.buffs} onChange={(buffs) => setSprite({ buffs })} options={STAT_OPTIONS} keyPlaceholder="属性" />
      <MapEditor label="减益" value={sprite.debuffs} onChange={(debuffs) => setSprite({ debuffs })} options={STAT_OPTIONS} keyPlaceholder="属性" />
      <MapEditor label="计数器" value={sprite.counters} onChange={(counters) => setSprite({ counters })} keyPlaceholder="key" />
      <MapEditor label="冷却" value={sprite.cooldowns} onChange={(cooldowns) => setSprite({ cooldowns })} keyPlaceholder="skillId" />
      <MapEditor label="队伍印记" value={side.teamMarks} onChange={(teamMarks) => onChange({ ...side, teamMarks })} options={marks} keyPlaceholder="选择印记" />
    </div>
  );
}

// ---------------------------------------------------------------- 主视图

export function DebugView() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugState | null>(null);
  const [legal, setLegal] = useState<{ player: Action[]; enemy: Action[] }>({ player: [], enemy: [] });
  const [playerIndex, setPlayerIndex] = useState(0);
  const [enemyIndex, setEnemyIndex] = useState(0);
  const [steps, setSteps] = useState<{ rows: TraceRow[]; label: string }[]>([]);
  const [history, setHistory] = useState<DebugState[]>([]);
  const [terminal, setTerminal] = useState<StepResult["terminal"] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getCatalog();
        if (cancelled) return;
        setCatalog(loaded);
        const initial = createInitial(loaded);
        setDebug(initial);
        const result = await workerRequest<{ player: Action[]; enemy: Action[] }>("debug/legal", { state: toBattleState(initial) });
        if (cancelled) return;
        setLegal(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickAction = (list: Action[], index: number): Action => list[index] ?? { kind: "defend" };

  const step = async () => {
    if (!catalog || !debug || busy) return;
    setBusy(true);
    try {
      const playerAction = pickAction(legal.player, playerIndex);
      const enemyAction = pickAction(legal.enemy, enemyIndex);
      const result = await workerRequest<StepResult>("debug/step", {
        state: toBattleState(debug),
        playerAction,
        enemyAction,
        seed: debug.seed,
      });
      const rows = rowsFromLog(result.log, catalog);
      setSteps((prev) => [...prev, { rows, label: `第 ${debug.turn} 回合` }]);
      setHistory((prev) => [...prev, debug]);
      setDebug(toDebugState(parseState(result.state)));
      setLegal(result.legal);
      setPlayerIndex(0);
      setEnemyIndex(0);
      setTerminal(result.terminal);
      // 全景图轨迹埋点（P2）：本步操作 + 事件流聚合后写 localStorage，/engine 全景回来点亮。
      recordAtlasStep(
        "debug",
        collectAtlasStep({
          turn: debug.turn,
          actions: [
            { side: "player", kind: playerAction.kind, skillId: playerAction.skillId, benchId: playerAction.benchId, label: actionLabel(playerAction, catalog) },
            { side: "enemy", kind: enemyAction.kind, skillId: enemyAction.skillId, benchId: enemyAction.benchId, label: actionLabel(enemyAction, catalog) },
          ],
          log: result.log,
        }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rollback = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((prev) => prev.slice(0, -1));
    setSteps((prev) => prev.slice(0, -1));
    setDebug(previous);
    setTerminal(null);
    void workerRequest<{ player: Action[]; enemy: Action[] }>("debug/legal", { state: toBattleState(previous) })
      .then(setLegal)
      .catch(() => setLegal({ player: [], enemy: [] }));
  };

  const reset = async () => {
    if (!catalog) return;
    const initial = createInitial(catalog);
    setDebug(initial);
    setSteps([]);
    setHistory([]);
    setTerminal(null);
    setPlayerIndex(0);
    setEnemyIndex(0);
    try {
      setLegal(await workerRequest("debug/legal", { state: toBattleState(initial) }));
    } catch {
      setLegal({ player: [], enemy: [] });
    }
  };

  const weatherOptions = useMemo(
    () => [{ id: "", name: "无天气" }, ...(catalog?.weather ?? []).map((w) => ({ id: w.id, name: w.nameZh ?? w.name }))],
    [catalog],
  );

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
        {error}　请先启动开发服务（`pwsh scripts/dev.ps1`）。
      </div>
    );
  }
  if (!catalog || !debug) {
    return <p className="text-[13px] text-muted-foreground">正在加载图鉴…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 min-[860px]:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="状态编辑" className="min-h-[240px]" bodyClassName="min-h-0 overflow-y-auto">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              回合
              <Input type="number" value={debug.turn} onChange={(e) => setDebug({ ...debug, turn: Number(e.target.value) || 1 })} className="h-7 w-full px-1.5 text-[11px] tnum" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              种子
              <Input type="number" value={debug.seed} onChange={(e) => setDebug({ ...debug, seed: Number(e.target.value) || 0 })} className="h-7 w-full px-1.5 text-[11px] tnum" />
            </label>
            <label className="col-span-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              天气
              <NativeSelect
                value={debug.weather?.id ?? ""}
                onChange={(e) => setDebug({ ...debug, weather: e.target.value ? { id: e.target.value, turnsLeft: debug.weather?.turnsLeft ?? 5 } : null })}
                className="h-7 flex-1 px-1 text-[11px]"
              >
                {weatherOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
              {debug.weather ? (
                <Input
                  type="number"
                  value={debug.weather.turnsLeft}
                  onChange={(e) => setDebug({ ...debug, weather: { id: debug.weather!.id, turnsLeft: Number(e.target.value) || 0 } })}
                  className="h-7 w-14 px-1.5 text-[11px] tnum"
                />
              ) : null}
            </label>
          </div>
          <SidePanel title={SIDE_NAME.player} catalog={catalog} side={debug.player} onChange={(player) => setDebug({ ...debug, player })} />
          <SidePanel title={SIDE_NAME.enemy} catalog={catalog} side={debug.enemy} onChange={(enemy) => setDebug({ ...debug, enemy })} />
        </div>
      </Panel>

      <div className="space-y-3">
        <Panel title="双方行动（引擎合法行动）" actions={terminal ? <Badge variant={terminal.winner === "player" ? "default" : "destructive"}>{terminal.ended ? (terminal.winner === "player" ? `${SIDE_NAME.player}胜` : terminal.winner === "enemy" ? `${SIDE_NAME.enemy}胜` : "终局") : ""}</Badge> : undefined}>
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-1.5 min-[520px]:grid-cols-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {SIDE_NAME.player}
                <NativeSelect value={playerIndex} onChange={(e) => setPlayerIndex(Number(e.target.value))} className="h-8 flex-1 px-1 text-[12px]" disabled={legal.player.length === 0}>
                  {legal.player.map((action, index) => (
                    <option key={index} value={index}>
                      {actionLabel(action, catalog)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {SIDE_NAME.enemy}
                <NativeSelect value={enemyIndex} onChange={(e) => setEnemyIndex(Number(e.target.value))} className="h-8 flex-1 px-1 text-[12px]" disabled={legal.enemy.length === 0}>
                  {legal.enemy.map((action, index) => (
                    <option key={index} value={index}>
                      {actionLabel(action, catalog)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" onClick={() => void step()} disabled={busy || Boolean(terminal?.ended)}>
                {busy ? "结算中…" : "单步"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={rollback} disabled={history.length === 0 || busy}>
                回退
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void reset()} disabled={busy}>
                重置
              </Button>
              <span className="text-[11px] text-muted-foreground">真实结算（非快照回放）；同种子可复现。</span>
            </div>
          </div>
        </Panel>

        <Panel title="执行轨迹" bodyClassName="min-h-0 overflow-y-auto max-h-[52vh]">
          {steps.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">点「单步」结算一回合，事件按触发时机分组展示；伤害事件附分解明细。</p>
          ) : (
            <div className="space-y-2">
              {steps.map((stepEntry, stepIndex) => (
                <div key={stepIndex} className="space-y-1">
                  <div className="text-[11px] font-medium text-muted-foreground">{stepEntry.label}</div>
                  {groupRows(stepEntry.rows).map((group, groupIndex) => (
                    <div key={groupIndex} className="rounded-md border bg-card p-2">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          {group.trigger ? triggerMetaOf(group.trigger).title : "引擎事件"}
                        </Badge>
                        {group.trigger ? <span className="tnum text-[10px] text-muted-foreground">{group.trigger}</span> : null}
                      </div>
                      {group.rows.map((row, rowIndex) => (
                        <div key={rowIndex} className="text-[11px] leading-5">
                          <span className="text-foreground/90">{row.text}</span>
                          {row.breakdown && Object.keys(row.breakdown).length ? (
                            <span className="ml-2 inline-flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground tnum">
                              {Object.entries(row.breakdown).map(([key, value]) => (
                                <span key={key}>
                                  {BREAKDOWN_LABELS[key] ?? key} {typeof value === "number" ? Math.round(value * 100) / 100 : String(value)}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function groupRows(rows: TraceRow[]): { trigger: string; rows: TraceRow[] }[] {
  const groups: { trigger: string; rows: TraceRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.trigger === row.trigger) last.rows.push(row);
    else groups.push({ trigger: row.trigger, rows: [row] });
  }
  return groups;
}
