"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { forcedSwitch, getCatalog, recommend, requestLeader, simulateTurn } from "@/modules/battle/client";
import { loadOpponentLibrary } from "@/modules/battle/storage";
import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import type {
  ActiveSpriteState,
  BattleEvent,
  BattleState,
  Catalog,
  RecommendResult,
  Terminal,
} from "@/modules/battle/types";
import { OtherActions, SkillGrid, SpriteCard } from "./side-panel";
import { TeamEditor } from "./pet-setup";
import { StatRadar } from "@/components/stat-radar";
import { SpriteImage } from "@/components/sprite-image";
import { TrendChart, type TrendPoint } from "./trend-chart";
import { computeStats } from "@/modules/engine/stats";
import {
  actionKey,
  buildState,
  deriveActions,
  elementZh,
  emptySetup,
  optionFromSkill,
  skillById,
  spriteOf,
  swapState,
  type ActionOption,
  type TeamEntry,
} from "./util";

const PRESETS = {
  fast: { label: "快速", maxIterations: 400, timeLimitMs: 300 },
  standard: { label: "标准", maxIterations: 1000, timeLimitMs: 1500 },
  deep: { label: "深入", maxIterations: 2500, timeLimitMs: 3000 },
} as const;

type PresetKey = keyof typeof PRESETS;

function rateMap(r: RecommendResult | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of r?.actions ?? []) m.set(actionKey(a.action), a.winRate);
  return m;
}

function FaintPicker({
  catalog,
  title,
  bench,
  tone,
  rate,
  busy,
  onPick,
}: {
  catalog: Catalog;
  title: string;
  bench: ActiveSpriteState[];
  tone: "player" | "enemy";
  rate: Map<string, number>;
  busy: boolean;
  onPick: (benchId: string) => void;
}) {
  const color = tone === "player" ? PLAYER_COLOR : ENEMY_COLOR;
  return (
    <Card className="border-destructive/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-destructive">{title}阵亡 · 选择上场精灵</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {bench
          .filter((b) => b.hp > 0)
          .map((b) => {
            const sp = spriteOf(catalog, b.spriteId);
            const wr = rate.get(`switch:${b.spriteId}`);
            return (
              <button
                key={b.spriteId}
                type="button"
                disabled={busy}
                onClick={() => onPick(b.spriteId)}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left hover:bg-accent disabled:opacity-60"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <SpriteImage sprite={sp} size="sm" className="h-11 w-11 rounded-lg" />
                  <span className="text-sm font-medium">{sp?.name ?? b.spriteId}</span>
                  {sp?.elements.map((el) => (
                    <Badge key={el} variant="outline">
                      {elementZh(catalog, el)}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    HP {b.hp}/{b.maxHp} · 能量 {b.energy}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color }}>
                  {wr === undefined ? "—" : `${(wr * 100).toFixed(1)}%`}
                </span>
              </button>
            );
          })}
      </CardContent>
    </Card>
  );
}

const DEFAULT_PLAYER = ["sp-6", "sp-7", "sp-10", "sp-17"];
const DEFAULT_ENEMY = ["sp-14", "sp-20", "sp-29", "sp-38"];

/** 我方：资质 / 技能已知 → 带 setup；技能留空即默认本精灵 4 招。 */
function playerEntries(): TeamEntry[] {
  return DEFAULT_PLAYER.map((spriteId) => ({ spriteId, setup: emptySetup() }));
}

/** 对方：只知道精灵 → 无资质、技能未知。 */
function enemyEntries(): TeamEntry[] {
  return DEFAULT_ENEMY.map((spriteId) => ({ spriteId, skillsUnknown: true }));
}


export function BattleBoard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"setup" | "battle">("setup");
  const [mode, setMode] = useState<"sandbox" | "pvp">("pvp");
  const [playerTeam, setPlayerTeam] = useState<TeamEntry[]>(playerEntries);
  const [enemyTeam, setEnemyTeam] = useState<TeamEntry[]>(enemyEntries);
  const [preset, setPreset] = useState<PresetKey>("standard");

  const [state, setState] = useState<BattleState | null>(null);
  const [rec, setRec] = useState<RecommendResult | null>(null);
  const [enemyRec, setEnemyRec] = useState<RecommendResult | null>(null);
  const [history, setHistory] = useState<TrendPoint[]>([]);
  const [pendingP, setPendingP] = useState<ActionOption | null>(null);
  const [pendingE, setPendingE] = useState<ActionOption | null>(null);
  const [log, setLog] = useState<BattleEvent[]>([]);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((e: Error) => setError(e.message));
  }, []);

  const playerOptions = useMemo(
    () => (catalog && state ? deriveActions(state.player, catalog) : []),
    [catalog, state],
  );
  const enemyOptions = useMemo(
    () => (catalog && state ? deriveActions(state.enemy, catalog) : []),
    [catalog, state],
  );
  const playerOthers = useMemo(() => playerOptions.filter((o) => o.action.kind !== "skill"), [playerOptions]);
  const enemyOthers = useMemo(() => enemyOptions.filter((o) => o.action.kind !== "skill"), [enemyOptions]);

  async function refresh(st: BattleState): Promise<Omit<TrendPoint, "turn">> {
    const o = {
      ...PRESETS[preset],
      explorationC: 1.414,
      rolloutMaxTurns: 12,
      seed: st.seed,
      opponentLibrary: loadOpponentLibrary() as unknown as Record<string, unknown>,
    };
    const [p, e] = await Promise.all([recommend(st, o), recommend(swapState(st), o)]);
    setRec(p);
    setEnemyRec(e);
    return { myWin: p.actions[0]?.winRate ?? 0, enemyWin: e.actions[0]?.winRate ?? 0 };
  }

  async function start() {
    if (!catalog) return;
    const plain = (team: TeamEntry[]): TeamEntry[] => team.map((e) => ({ spriteId: e.spriteId }));
    const st =
      mode === "pvp"
        ? buildState(catalog, playerTeam, enemyTeam)
        : buildState(catalog, plain(playerTeam), plain(enemyTeam));
    setState(st);
    setHistory([]);
    setLog([]);
    setTerminal(null);
    setPendingP(null);
    setPendingE(null);
    setPhase("battle");
    setBusy(true);
    try {
      const w = await refresh(st);
      setHistory([{ turn: st.turn, ...w }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(pP: ActionOption, pE: ActionOption) {
    if (!state) return;
    setBusy(true);
    try {
      const res = await simulateTurn(state, pP.action, pE.action, state.seed);
      setState(res.state);
      setLog(res.log);
      setTerminal(res.terminal);
      setPendingP(null);
      setPendingE(null);
      if (res.terminal.ended) {
        setRec(null);
        setEnemyRec(null);
        toast.success(res.terminal.reason);
      } else {
        const w = await refresh(res.state);
        setHistory((h) => [...h, { turn: res.state.turn, ...w }]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choosePlayer(o: ActionOption) {
    if (busy || terminal?.ended) return;
    if (state && (state.player.active.hp <= 0 || state.enemy.active.hp <= 0)) return;
    setPendingP(o);
    if (pendingE) void resolve(o, pendingE);
  }

  function chooseEnemy(o: ActionOption) {
    if (busy || terminal?.ended) return;
    if (state && (state.player.active.hp <= 0 || state.enemy.active.hp <= 0)) return;
    setPendingE(o);
    if (pendingP) void resolve(pendingP, o);
  }

  async function applyForcedSwitch(who: "player" | "enemy", benchId: string) {
    if (!state || busy) return;
    setBusy(true);
    try {
      const res = await forcedSwitch(state, who, benchId);
      setState(res.state);
      setLog(res.log);
      await refresh(res.state);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyLeader(who: "player" | "enemy") {
    if (!state || busy || terminal?.ended) return;
    setBusy(true);
    try {
      const res = await requestLeader(state, who);
      setState(res.state);
      setLog(res.log);
      await refresh(res.state);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function setLoadout(who: "player" | "enemy", index: number, skillId: string) {
    if (!state || terminal?.ended) return;
    const next = structuredClone(state);
    const loadout = [...next[who].active.loadout];
    loadout[index] = skillId;
    next[who].active.loadout = loadout.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4);
    setState(next);
    setPendingP(null);
    setPendingE(null);
    void refresh(next);
  }

  function playSkill(who: "player" | "enemy", skillId: string) {
    if (!catalog) return;
    const sk = skillById(catalog, skillId);
    if (!sk) return;
    const option = optionFromSkill(catalog, sk);
    if (who === "player") choosePlayer(option);
    else chooseEnemy(option);
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

  if (!catalog) {
    return <p className="text-sm text-muted-foreground">正在加载引擎数据…</p>;
  }

  if (phase === "setup" || !state) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-dashed bg-card/70 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">先配置双方阵容</span>，首位精灵将作为首发、双方各上场一只。
          每队最多 6 只。PvP 模式下我方录入资质 / 技能，对方只登记精灵。
        </div>
        <Card>
          <CardContent className="flex flex-col gap-3 py-3 text-sm min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
            <div className="space-y-1">
              <div className="font-medium text-foreground">对战模式</div>
              <p className="text-muted-foreground">
                {mode === "pvp"
                  ? "PvP：我方资质 / 技能已知；对方只知道精灵，资质 / 性格 / 技能未知（按中性 5★·60 级估算）。"
                  : "沙盒：双方都按默认，纯推演。"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "pvp" ? "default" : "outline"}
                onClick={() => setMode("pvp")}
              >
                PvP
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "sandbox" ? "default" : "outline"}
                onClick={() => setMode("sandbox")}
              >
                沙盒
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 min-[860px]:grid-cols-2">
          <TeamEditor
            title="我方队伍"
            scope="player"
            entries={playerTeam}
            catalog={catalog}
            editable={mode === "pvp"}
            onChange={setPlayerTeam}
          />
          <TeamEditor
            title="敌方队伍（对方）"
            scope="enemy"
            entries={enemyTeam}
            catalog={catalog}
            editable={false}
            skillsUnknown
            onChange={setEnemyTeam}
          />
        </div>
        <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-center">
          <Button className="w-full min-[520px]:w-auto" type="button" onClick={start} disabled={busy}>
            {busy ? "准备中…" : "开始对战"}
          </Button>
        </div>
      </div>
    );
  }

  const playerFainted = state.player.active.hp <= 0 && state.player.bench.some((b) => b.hp > 0);
  const enemyFainted = state.enemy.active.hp <= 0 && state.enemy.bench.some((b) => b.hp > 0);
  const anyFaint = playerFainted || enemyFainted;
  const playerRate = rateMap(rec);
  const enemyRate = rateMap(enemyRec);
  const playerSprite = spriteOf(catalog, state.player.active.spriteId);
  const playerPanel =
    catalog.stats && playerSprite
      ? computeStats(catalog.stats, { race: playerSprite.race }, state.player.active.profile)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-soft min-[520px]:flex-row min-[520px]:items-center">
        <Badge variant={mode === "pvp" ? "default" : "outline"}>{mode === "pvp" ? "PvP" : "沙盒"}</Badge>
        <Badge variant="outline">第 {state?.turn ?? 1} 回合</Badge>
        <Badge variant="outline">
          {state?.weather ? `天气 ${state.weather.id}（${state.weather.turnsLeft}）` : "无天气"}
        </Badge>
        {rec && (
          <Badge variant="outline">
            推演 {rec.meta.iterations} 次 / {rec.meta.elapsedMs}ms
          </Badge>
        )}
        {busy && <Badge variant="secondary">重算中…</Badge>}
        <div className="flex flex-wrap items-center gap-2 min-[520px]:ml-auto">
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
          <Button type="button" size="sm" variant="outline" onClick={() => setPhase("setup")}>
            重选队伍
          </Button>
          <Link href="/record" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            详细录入
          </Link>
        </div>
      </div>

      {terminal?.ended && (
        <Card className="border-primary">
          <CardContent className="py-3 text-sm font-medium">
            对局结束：{terminal.winner === "player" ? "我方" : "敌方"}胜 · {terminal.reason}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">胜率走势</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart history={history} />
        </CardContent>
      </Card>

      <div className="grid gap-4 min-[860px]:grid-cols-2">
        <div className="space-y-3 rounded-lg border-l-4 pl-3" style={{ borderLeftColor: PLAYER_COLOR }}>
          <SpriteCard title="我方场上" side={state.player} tone="player" catalog={catalog} />
          {playerPanel && (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">我方面板</CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <StatRadar panel={playerPanel} className="h-[220px] w-full" />
              </CardContent>
            </Card>
          )}
          {playerFainted ? (
            <FaintPicker
              catalog={catalog}
              title="我方"
              bench={state.player.bench}
              tone="player"
              rate={playerRate}
              busy={busy}
              onPick={(id) => applyForcedSwitch("player", id)}
            />
          ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>我方动作</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {pendingP ? `已选：${pendingP.label}` : "待选"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">技能（2×2，点技能即使用；右上「换」改技能）</span>
                {spriteOf(catalog, state.player.active.spriteId)?.leaderAllowed && !state.player.leaderUsed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || anyFaint || Boolean(terminal?.ended)}
                    onClick={() => applyLeader("player")}
                  >
                    首领化
                  </Button>
                ) : state.player.leaderUsed ? (
                  <Badge variant="secondary">已首领化</Badge>
                ) : null}
              </div>
              <SkillGrid
                catalog={catalog}
                side={state.player}
                rec={rec}
                tone="player"
                selectedKey={pendingP ? actionKey(pendingP.action) : null}
                disabled={busy || anyFaint || Boolean(terminal?.ended)}
                onUse={(id) => playSkill("player", id)}
                onChangeSlot={(i, id) => setLoadout("player", i, id)}
              />
              <div className="h-px bg-border" />
              <OtherActions
                options={playerOthers}
                rec={rec}
                tone="player"
                selectedKey={pendingP ? actionKey(pendingP.action) : null}
                disabled={busy || anyFaint || Boolean(terminal?.ended)}
                onUse={choosePlayer}
              />
            </CardContent>
          </Card>
          )}
        </div>

        <div className="space-y-3 rounded-lg border-l-4 pl-3" style={{ borderLeftColor: ENEMY_COLOR }}>
          <SpriteCard
            title="敌方场上"
            side={state.enemy}
            tone="enemy"
            catalog={catalog}
            subtitle={mode === "pvp" ? "资质未知 · 按中性 5★·60 级估算" : "推测 / 可观测"}
          />
          {enemyFainted ? (
            <FaintPicker
              catalog={catalog}
              title="敌方"
              bench={state.enemy.bench}
              tone="enemy"
              rate={enemyRate}
              busy={busy}
              onPick={(id) => applyForcedSwitch("enemy", id)}
            />
          ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>敌方动作</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {pendingE ? `已选：${pendingE.label}` : "待选"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {mode === "pvp"
                    ? "对方技能未知 → 用右上「换」记录它这回合实际用的技能"
                    : "技能（2×2，点技能即使用；右上「换」改技能）"}
                </span>
                {spriteOf(catalog, state.enemy.active.spriteId)?.leaderAllowed && !state.enemy.leaderUsed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || anyFaint || Boolean(terminal?.ended)}
                    onClick={() => applyLeader("enemy")}
                  >
                    首领化
                  </Button>
                ) : state.enemy.leaderUsed ? (
                  <Badge variant="secondary">已首领化</Badge>
                ) : null}
              </div>
              <SkillGrid
                catalog={catalog}
                side={state.enemy}
                rec={enemyRec}
                tone="enemy"
                selectedKey={pendingE ? actionKey(pendingE.action) : null}
                disabled={busy || anyFaint || Boolean(terminal?.ended)}
                onUse={(id) => playSkill("enemy", id)}
                onChangeSlot={(i, id) => setLoadout("enemy", i, id)}
              />
              <div className="h-px bg-border" />
              <OtherActions
                options={enemyOthers}
                rec={enemyRec}
                tone="enemy"
                selectedKey={pendingE ? actionKey(pendingE.action) : null}
                disabled={busy || anyFaint || Boolean(terminal?.ended)}
                onUse={chooseEnemy}
              />
            </CardContent>
          </Card>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center">
        <Button
          type="button"
          className="w-full min-[520px]:w-auto"
          size="sm"
          variant="secondary"
          disabled={busy || (!pendingP && !pendingE)}
          onClick={() => {
            setPendingP(null);
            setPendingE(null);
          }}
        >
          撤销选择
        </Button>
        <span className="text-xs text-muted-foreground">双方各选一个动作后自动结算并重算胜率。</span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">回合日志</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          {log.length === 0 && <p className="text-muted-foreground">暂无事件。</p>}
          {log.map((e, i) => (
            <p key={i} className={e.side === "enemy" ? "text-muted-foreground" : ""}>
              <span className="mr-1 font-mono text-[10px] text-muted-foreground">[{e.type}]</span>
              {e.text}
            </p>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}
