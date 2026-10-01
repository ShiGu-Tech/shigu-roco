import type { BattleEvent, BattleState, Catalog, Terminal } from "@/modules/battle/types";
import type { TrendPoint } from "@/modules/board/trend-chart";

/** 一帧 = 回合开始前（第 0 帧）或某次结算之后的局面。与对战台 Frame 同构，用于回放。 */
export interface ReplayFrame {
  turn: number;
  state: BattleState;
  log: BattleEvent[];
  history: TrendPoint[];
  terminal: Terminal | null;
  label: string;
}

/** 一局对战记录。自包含：回放只读本记录 + 对应 catalogKey 的快照。 */
export interface Replay {
  id: string;
  name: string;
  createdAt: number;
  /** 指向 ReplayCatalog.key（当时的数据快照）。 */
  catalogKey: string;
  seed: number;
  playerLabel: string;
  enemyLabel: string;
  winner: "player" | "enemy" | null;
  reason: string;
  turns: number;
  frames: ReplayFrame[];
}

/** 按数据版本归档的完整 catalog 快照：保证回放不受最新技能数据影响。 */
export interface ReplayCatalog {
  key: string;
  dataVersion: string;
  dataUpdatedAt: string;
  catalog: Catalog;
}
