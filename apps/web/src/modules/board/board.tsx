"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

import { forcedSwitch, getCatalog, recommend, requestLeader, simulateTurn } from "@/modules/battle/client";
import { loadOpponentLibrary } from "@/modules/battle/storage";
import { ENEMY_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";
import { describeEvent } from "./log";
import type { BattleEvent, BattleState, Catalog, RecommendResult, Terminal } from "@/modules/battle/types";
import { ActiveBoard } from "./active-board";
import { TeamEditor } from "./pet-setup";
import { Timeline } from "./timeline";
import { TrendChart, type TrendPoint } from "./trend-chart";
import {
  actionKey,
  buildState,
  deriveActions,
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

/** 一个可回退的存档点：该回合「开始前」的局面 + 抵达时的日志 / 走势。 */
interface Frame {
  turn: number;
  state: BattleState;
  log: BattleEvent[];
  history: TrendPoint[];
  terminal: Terminal | null;
  label: string;
}

function plain(team: TeamEntry[]): TeamEntry[] {
  return team.map((e) => ({ spriteId: e.spriteId }));
}

const DEFAULT_PLAYER = ["sp-1-1", "sp-4-1", "sp-7-1", "sp-10-1", "sp-15-1", "sp-13-1"];
const DEFAULT_ENEMY = ["sp-2-1", "sp-5-1", "sp-8-1", "sp-11-1", "sp-16-1", "sp-12-1"];

function playerEntries(): TeamEntry[] {
  return DEFAULT_PLAYER.map((spriteId) => ({ spriteId, setup: emptySetup() }));
}

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

  const [frames, setFrames] = useState<Frame[]>([]);
  const [cursor, setCursor] = useState(0);
  const [rec, setRec] = useState<RecommendResult | null>(null);
  const [enemyRec, setEnemyRec] = useState<RecommendResult | null>(null);
  const [pendingP, setPendingP] = useState<ActionOption | null>(null);
  const [pendingE, setPendingE] = useState<ActionOption | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((e: Error) => setError(e.message));
  }, []);

  const current = frames[cursor] ?? null;
  const state = current?.state ?? null;
  const log = current?.log ?? [];
  const history = current?.history ?? [];
  const terminal = current?.terminal ?? null;

  const playerOptions = useMemo(
    () => (catalog && state ? deriveActions(state.player, catalog) : []),
    [catalog, state],
  );
  const enemyOptions = useMemo(
    () => (catalog && state ? deriveActions(state.enemy, catalog) : []),
    [catalog, state],
  );
  const playerOthers = useMemo(
    () => playerOptions.filter((o) => o.action.kind !== "skill" && o.action.kind !== "switch"),
    [playerOptions],
  );
  const enemyOthers = useMemo(
    () => enemyOptions.filter((o) => o.action.kind !== "skill" && o.action.kind !== "switch"),
    [enemyOptions],
  );

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
    const st =
      mode === "pvp"
        ? buildState(catalog, playerTeam, enemyTeam)
        : buildState(catalog, plain(playerTeam), plain(enemyTeam));
    setPendingP(null);
    setPendingE(null);
    setPhase("battle");
    setBusy(true);
    try {
      const w = await refresh(st);
      setFrames([{ turn: st.turn, state: st, log: [], history: [{ turn: st.turn, ...w }], terminal: null, label: `回合 ${st.turn}` }]);
      setCursor(0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(pP: ActionOption, pE: ActionOption) {
    if (!current) return;
    const base = current;
    setBusy(true);
    try {
      const res = await simulateTurn(base.state, pP.action, pE.action, base.state.seed);
      setPendingP(null);
      setPendingE(null);
      let frame: Frame;
      if (res.terminal.ended) {
        setRec(null);
        setEnemyRec(null);
        toast.success(res.terminal.reason);
        frame = { turn: res.state.turn, state: res.state, log: res.log, history: base.history, terminal: res.terminal, label: `回合 ${res.state.turn}（结束）` };
      } else {
        const w = await refresh(res.state);
        frame = { turn: res.state.turn, state: res.state, log: res.log, history: [...base.history, { turn: res.state.turn, ...w }], terminal: null, label: `回合 ${res.state.turn}` };
      }
      setFrames((f) => [...f, frame]);
      setCursor((c) => c + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choosePlayer(o: ActionOption) {
    if (busy || terminal?.ended || !state) return;
    if (state.player.active.hp <= 0 || state.enemy.active.hp <= 0) return;
    setPendingP(o);
    if (pendingE) void resolve(o, pendingE);
  }

  function chooseEnemy(o: ActionOption) {
    if (busy || terminal?.ended || !state) return;
    if (state.player.active.hp <= 0 || state.enemy.active.hp <= 0) return;
    setPendingE(o);
    if (pendingP) void resolve(pendingP, o);
  }

  function chooseOther(who: "player" | "enemy", o: ActionOption) {
    if (o.action.kind === "leader") {
      void applyLeader(who);
      return;
    }
    if (who === "player") choosePlayer(o);
    else chooseEnemy(o);
  }

  async function applyForcedSwitch(who: "player" | "enemy", benchId: string) {
    if (!current || busy) return;
    const base = current;
    setBusy(true);
    try {
      const res = await forcedSwitch(base.state, who, benchId);
      const frame: Frame = {
        turn: res.state.turn,
        state: res.state,
        log: res.log,
        history: base.history,
        terminal: base.terminal,
        label: `${who === "player" ? "我方" : "敌方"}阵亡换人`,
      };
      setFrames((f) => [...f, frame]);
      setCursor((c) => c + 1);
      await refresh(res.state);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyLeader(who: "player" | "enemy") {
    if (!current || busy || terminal?.ended) return;
    const base = current;
    setBusy(true);
    try {
      const res = await requestLeader(base.state, who);
      const frame: Frame = {
        turn: res.state.turn,
        state: res.state,
        log: res.log,
        history: base.history,
        terminal: base.terminal,
        label: `${who === "player" ? "我方" : "敌方"}首领化`,
      };
      setFrames((f) => [...f, frame]);
      setCursor((c) => c + 1);
      await refresh(res.state);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickBench(who: "player" | "enemy", benchId: string) {
    if (!state || busy || terminal?.ended) return;
    if (state[who].active.hp <= 0) {
      void applyForcedSwitch(who, benchId);
      return;
    }
    const bs = spriteOf(catalog!, benchId);
    const option: ActionOption = {
      action: { kind: "switch", benchId, label: `换 ${bs?.name ?? benchId}` },
      label: `换 ${bs?.name ?? benchId}`,
      kindLabel: "换人",
    };
    if (who === "player") choosePlayer(option);
    else chooseEnemy(option);
  }

  async function rollbackTo(index: number) {
    if (busy || index < 0 || index >= frames.length) return;
    setPendingP(null);
    setPendingE(null);
    setFrames(frames.slice(0, index + 1));
    setCursor(index);
    setBusy(true);
    try {
      const target = frames[index];
      if (target.terminal?.ended) {
        setRec(null);
        setEnemyRec(null);
      } else {
        await refresh(target.state);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function setLoadout(who: "player" | "enemy", index: number, skillId: string) {
    if (!current || terminal?.ended) return;
    const next = structuredClone(current.state);
    const loadout = [...next[who].active.loadout];
    loadout[index] = skillId;
    next[who].active.loadout = loadout.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4);
    const nextFrames = [...frames];
    nextFrames[cursor] = { ...current, state: next };
    setFrames(nextFrames);
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
      <Panel title="引擎未就绪">
        <div className="space-y-2 text-[13px]">
          <p>{error}</p>
          <p className="text-muted-foreground">
            请启动前端：<code className="rounded-sm bg-muted px-1 font-mono">pwsh scripts/dev.ps1</code>（内置 TS 引擎，127.0.0.1:26900）。
          </p>
        </div>
      </Panel>
    );
  }

  if (!catalog) {
    return <p className="text-[13px] text-muted-foreground">正在加载引擎数据…</p>;
  }

  if (phase === "setup" || !current) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-dashed p-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">先配置双方阵容</span>，首位精灵作为首发、双方各上场一只；每队最多 6 只（6v6）。PvP 模式下我方录入资质 / 技能，对方只登记精灵。
        </div>
        <Panel>
          <div className="flex flex-col gap-3 text-[13px] min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
            <div className="space-y-0.5">
              <div className="font-medium">对战模式</div>
              <p className="text-muted-foreground">
                {mode === "pvp"
                  ? "PvP：我方资质 / 技能已知；对方只知道精灵，资质 / 性格 / 技能未知（按中性 5★·60 级估算）。"
                  : "沙盒：双方都按默认，纯推演。"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant={mode === "pvp" ? "default" : "outline"} onClick={() => setMode("pvp")}>
                PvP
              </Button>
              <Button type="button" size="sm" variant={mode === "sandbox" ? "default" : "outline"} onClick={() => setMode("sandbox")}>
                沙盒
              </Button>
            </div>
          </div>
        </Panel>
        <div className="grid gap-3 min-[860px]:grid-cols-2">
          <TeamEditor title="我方队伍" scope="player" entries={playerTeam} catalog={catalog} editable={mode === "pvp"} onChange={setPlayerTeam} />
          <TeamEditor title="敌方队伍（对方）" scope="enemy" entries={enemyTeam} catalog={catalog} editable={false} skillsUnknown onChange={setEnemyTeam} />
        </div>
        <Button type="button" onClick={start} disabled={busy}>
          {busy ? "准备中…" : "开始对战"}
        </Button>
      </div>
    );
  }

  const playerFainted = state!.player.active.hp <= 0 && state!.player.bench.some((b) => b.hp > 0);
  const enemyFainted = state!.enemy.active.hp <= 0 && state!.enemy.bench.some((b) => b.hp > 0);
  const maxMagic = Number(
    (catalog.rules as { magicMax?: number; magic?: { maxPerSide?: number } }).magicMax ??
      (catalog.rules as { magic?: { maxPerSide?: number } }).magic?.maxPerSide ??
      4,
  );
  const anyFaint = playerFainted || enemyFainted;

  const playerLeader =
    spriteOf(catalog, state!.player.active.spriteId)?.leaderAllowed && !state!.player.leaderUsed
      ? ([{ action: { kind: "leader", label: "首领化" }, label: "首领化", kindLabel: "全局一次" }] as ActionOption[])
      : [];
  const enemyLeader =
    spriteOf(catalog, state!.enemy.active.spriteId)?.leaderAllowed && !state!.enemy.leaderUsed
      ? ([{ action: { kind: "leader", label: "首领化" }, label: "首领化", kindLabel: "全局一次" }] as ActionOption[])
      : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-md border bg-card p-2 min-[520px]:flex-row min-[520px]:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={mode === "pvp" ? "default" : "outline"}>{mode === "pvp" ? "PvP" : "沙盒"}</Badge>
          <Badge variant="outline" className="tnum">第 {state!.turn} 回合</Badge>
          <Badge variant="outline">
            {state!.weather
              ? `天气 ${catalog.weather.find((w) => w.id === state!.weather!.id)?.nameZh ?? state!.weather.id}（剩 ${state!.weather.turnsLeft}）`
              : "无天气"}
          </Badge>
          {rec && <Badge variant="outline" className="tnum">推演 {rec.meta.iterations} 次 / {rec.meta.elapsedMs}ms</Badge>}
          {busy && <Badge variant="secondary">重算中…</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2 min-[520px]:ml-auto">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
            <Button key={k} type="button" size="sm" variant={preset === k ? "default" : "outline"} onClick={() => setPreset(k)}>
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

      <div className="grid gap-3 min-[860px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <div className="order-1 min-w-0">
          <ActiveBoard
            catalog={catalog}
            side={state!.player}
            tone="player"
            title="我方场上"
            maxMagic={maxMagic}
            rec={rec}
            selectedKey={pendingP ? actionKey(pendingP.action) : null}
            selectedBenchId={pendingP?.action.kind === "switch" ? (pendingP.action.benchId ?? null) : null}
            disabled={busy || anyFaint || Boolean(terminal?.ended)}
            benchDisabled={busy || Boolean(terminal?.ended)}
            fainted={playerFainted}
            otherOptions={[...playerOthers, ...playerLeader]}
            onUseSkill={(id) => playSkill("player", id)}
            onChangeSlot={(i, id) => setLoadout("player", i, id)}
            onUseOther={(o) => chooseOther("player", o)}
            onPickBench={(benchId) => pickBench("player", benchId)}
          />
        </div>

        <div className="order-3 flex min-w-0 flex-col gap-3 min-[860px]:order-2">
          {terminal?.ended && (
            <div className="rounded-md border border-primary/50 bg-primary/5 px-3 py-2 text-[13px] font-medium">
              对局结束：{terminal.winner === "player" ? "我方" : "敌方"}胜 · {terminal.reason}
            </div>
          )}
          <Panel title="胜率走势">
            <TrendChart history={history} />
          </Panel>
          <Panel title="回合时间线">
            <Timeline
              frames={frames.map((f) => ({ turn: f.turn, label: f.label }))}
              cursor={cursor}
              busy={busy}
              onJump={(i) => void rollbackTo(i)}
              onUndo={() => void rollbackTo(cursor - 1)}
            />
          </Panel>
          <Panel
            title="对战记录"
            actions={
              <span className="text-[12px] font-normal text-muted-foreground">
                {pendingP || pendingE ? "已选一侧，等待另一侧" : "双方各选一个动作后自动结算"}
              </span>
            }
            bodyClassName="p-0"
          >
            <div className="max-h-[380px] overflow-y-auto">
              {log.length === 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground">暂无事件。</p>}
              {log.map((e, i) => (
                <div key={i} className="flex items-start gap-2 border-b px-3 py-1.5 text-[12px] last:border-0">
                  <span
                    className="mt-[3px] shrink-0 text-[10px] leading-none"
                    style={{
                      color:
                        e.side === "player" ? PLAYER_COLOR : e.side === "enemy" ? ENEMY_COLOR : "var(--muted-foreground)",
                    }}
                  >
                    ●
                  </span>
                  <span>{describeEvent(e, catalog)}</span>
                </div>
              ))}
            </div>
            {(pendingP || pendingE) && (
              <div className="flex items-center gap-2 border-t px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setPendingP(null);
                    setPendingE(null);
                  }}
                >
                  撤销选择
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {pendingP ? `我方已选：${pendingP.label}` : ""}
                  {pendingP && pendingE ? " · " : ""}
                  {pendingE ? `敌方已选：${pendingE.label}` : ""}
                </span>
              </div>
            )}
          </Panel>
        </div>

        <div className="order-2 min-w-0 min-[860px]:order-3">
          <ActiveBoard
            catalog={catalog}
            side={state!.enemy}
            tone="enemy"
            title="敌方场上"
            subtitle={mode === "pvp" ? "资质未知 · 按中性 5★·60 级估算" : "推测 / 可观测"}
            maxMagic={maxMagic}
            rec={enemyRec}
            selectedKey={pendingE ? actionKey(pendingE.action) : null}
            selectedBenchId={pendingE?.action.kind === "switch" ? (pendingE.action.benchId ?? null) : null}
            disabled={busy || anyFaint || Boolean(terminal?.ended)}
            benchDisabled={busy || Boolean(terminal?.ended)}
            fainted={enemyFainted}
            otherOptions={[...enemyOthers, ...enemyLeader]}
            onUseSkill={(id) => playSkill("enemy", id)}
            onChangeSlot={(i, id) => setLoadout("enemy", i, id)}
            onUseOther={(o) => chooseOther("enemy", o)}
            onPickBench={(benchId) => pickBench("enemy", benchId)}
          />
        </div>
      </div>
    </div>
  );
}
