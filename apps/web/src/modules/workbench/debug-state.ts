/** 调试沙盒的可编辑状态模型（工作台 G3a）。
 *
 * `DebugState` 是 `BattleState` 的「表单友好」子集：只保留调试要手改的字段
 * （HP / 能量 / 技能栏 / 印记 / 状态 / buff / debuff / 计数器 / 天气 / 魔力），
 * 双向转换为引擎 `BattleState`（真实结算用）。回放只播快照，调试沙盒真实重算——两者不同源。
 */

import { makeActive, makeSide, makeState } from "@/modules/engine/state";
import { maxHpFromRace } from "@/modules/engine/stats";
import type { ActiveSprite, BattleState, SideState, StatsData } from "@/modules/engine/types";

export interface DebugSprite {
  spriteId: string;
  hp: number;
  maxHp: number;
  energy: number;
  loadout: string[];
  buffs: Record<string, number>;
  debuffs: Record<string, number>;
  marks: Record<string, number>;
  statuses: Record<string, number>;
  cooldowns: Record<string, number>;
  counters: Record<string, number>;
}

export interface DebugSide {
  magic: number;
  active: DebugSprite;
  bench: DebugSprite[];
  teamMarks: Record<string, number>;
}

export interface DebugState {
  turn: number;
  seed: number;
  weather: { id: string; turnsLeft: number } | null;
  player: DebugSide;
  enemy: DebugSide;
}

export const EMPTY_MAPS = (): Pick<DebugSprite, "buffs" | "debuffs" | "marks" | "statuses" | "cooldowns" | "counters"> => ({
  buffs: {},
  debuffs: {},
  marks: {},
  statuses: {},
  cooldowns: {},
  counters: {},
});

/** 默认精灵：中性 5★·60 级口径估 maxHp（与 PvP 未知养成一致），技能栏取图鉴前 4 个。 */
export function createDebugSprite(opts: {
  spriteId: string;
  race: Record<string, number>;
  skillIds: string[];
  stats?: StatsData;
  maxHp?: number;
  energy?: number;
}): DebugSprite {
  const maxHp = opts.maxHp ?? Math.max(1, Math.round(maxHpFromRace(opts.stats ?? {}, opts.race, { level: 60, stars: 5 })));
  return {
    spriteId: opts.spriteId,
    hp: maxHp,
    maxHp,
    energy: opts.energy ?? 10,
    loadout: opts.skillIds.slice(0, 4),
    ...EMPTY_MAPS(),
  };
}

function toActive(debug: DebugSprite): ActiveSprite {
  const active = makeActive(debug.spriteId, { hp: debug.hp, maxHp: debug.maxHp, energy: debug.energy });
  active.loadout = [...debug.loadout];
  active.buffs = { ...debug.buffs };
  active.debuffs = { ...debug.debuffs };
  active.marks = { ...debug.marks };
  active.statuses = { ...debug.statuses };
  if (Object.keys(debug.cooldowns).length) active.cooldowns = { ...debug.cooldowns };
  if (Object.keys(debug.counters).length) active.counters = { ...debug.counters };
  active.entered = true;
  return active;
}

function toSide(debug: DebugSide): SideState {
  return makeSide(toActive(debug.active), {
    magic: debug.magic,
    bench: debug.bench.map(toActive),
    teamMarks: { ...debug.teamMarks },
  });
}

/** DebugState → 引擎 BattleState（真实结算入参）。 */
export function toBattleState(debug: DebugState): BattleState {
  return makeState(toSide(debug.player), toSide(debug.enemy), {
    turn: debug.turn,
    weather: debug.weather ? { ...debug.weather } : null,
    seed: debug.seed,
  });
}

function toDebugSprite(active: ActiveSprite): DebugSprite {
  return {
    spriteId: active.spriteId,
    hp: active.hp,
    maxHp: active.maxHp,
    energy: active.energy,
    loadout: [...active.loadout],
    buffs: { ...active.buffs },
    debuffs: { ...active.debuffs },
    marks: { ...active.marks },
    statuses: { ...active.statuses },
    cooldowns: { ...(active.cooldowns ?? {}) },
    counters: { ...(active.counters ?? {}) },
  };
}

function toDebugSide(side: SideState): DebugSide {
  return {
    magic: side.magic,
    active: toDebugSprite(side.active),
    bench: side.bench.map(toDebugSprite),
    teamMarks: { ...side.teamMarks },
  };
}

/** 引擎 BattleState → DebugState（单步结算后回填表单）。 */
export function toDebugState(state: BattleState): DebugState {
  return {
    turn: state.turn,
    seed: state.seed,
    weather: state.weather ? { id: state.weather.id, turnsLeft: state.weather.turnsLeft } : null,
    player: toDebugSide(state.player),
    enemy: toDebugSide(state.enemy),
  };
}
