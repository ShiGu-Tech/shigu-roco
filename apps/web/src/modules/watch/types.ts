/** 引擎观战房间（展示层，服务端内存）：宿主（对战台）推快照，观众只读。
 *
 * 事实源见 `docs/architecture/引擎观战-设计-v0.1.md`。房间**不含** `BattleState` / 引擎可操作状态，
 * 只存名号、轨迹步（`AtlasStep`）与**已渲染**事件文本，故观战页不引引擎。
 */

import type { AtlasStep } from "@/modules/atlas/types";

/** 一方展示信息（大屏标题用）。 */
export interface RoomSide {
  label: string;
  sprites: { id: string; name: string; element?: string }[];
}

/** 一条观战事件行：`text` 为叙事文本；`mechanism` 存在时渲染为「触发 / 机制 / 效果」胶囊（可查看定义）。 */
export interface WatchLogLine {
  side: "player" | "enemy" | "system";
  text: string;
  mechanism?: { trigger: string; mechanismId: string; effectType: string };
}

/** 一次「用户操作 → 引擎响应」的观战条目（每回合一条；强制换人另计）。 */
export interface WatchEntry {
  turn: number;
  /** "回合 2" / "我方阵亡换人"。 */
  label: string;
  actions: { side: "player" | "enemy"; label: string }[];
  /** 轨迹（复用 `modules/atlas/types`）。 */
  step: AtlasStep;
  /** 已渲染事件行（主机侧 `describeEvent` / `mechanismHitOf` 产出）。 */
  log: WatchLogLine[];
}

/** 观战房间（`/api/watch/rooms/[id]` 返回体）。 */
export interface WatchRoom {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "live" | "ended";
  seed: number;
  player: RoomSide;
  enemy: RoomSide;
  turn: number;
  terminal: { winner: "player" | "enemy" | null; reason: string } | null;
  entries: WatchEntry[];
  /** 已披露的 firing 数（`flattenFirings(entries.map(e => e.step))` 前缀）；主机逐触发器递增。 */
  head: number;
  dataVersion: string;
  engineVersion: string;
}
