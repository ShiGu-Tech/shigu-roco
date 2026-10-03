import { describe, expect, it } from "vitest";

import { createDebugSprite, toBattleState, toDebugState } from "../debug-state";
import type { DebugState } from "../debug-state";

const SPRITE = {
  spriteId: "sp-1-1",
  race: { hp: 120 },
  skillIds: ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"],
  stats: {
    panels: { hp: { base: 10, raceBase: 0.5, ivBase: 0.25, levelBase: 1, raceSlope: 0.02, ivSlope: 0.01 } },
    natureScaling: { upBase: 1.1, upPerStar: 0.02, downFactor: 0.9, starMax: 5 },
    starBonus: { hp: 20, default: 10, starMax: 5 },
    individual: { starMultiplier: 1, maxPerStat: 60, starMax: 6, investCount: 3 },
    natures: [],
  },
};

function makeDebug(): DebugState {
  const active = createDebugSprite(SPRITE);
  return {
    turn: 2,
    seed: 7,
    weather: { id: "sandstorm", turnsLeft: 3 },
    player: { magic: 3, active, bench: [createDebugSprite({ ...SPRITE, spriteId: "sp-2-1" })], teamMarks: { "starfall-mark": 2 } },
    enemy: { magic: 4, active: createDebugSprite({ ...SPRITE, spriteId: "sp-3-1" }), bench: [], teamMarks: {} },
  };
}

describe("workbench debug-state", () => {
  it("createDebugSprite：技能栏截 4 个、maxHp 由 5★·60 级面板口径估算", () => {
    const sprite = createDebugSprite(SPRITE);
    expect(sprite.loadout).toEqual(["sk-1", "sk-2", "sk-3", "sk-4"]);
    expect(sprite.hp).toBe(sprite.maxHp);
    expect(sprite.maxHp).toBeGreaterThan(100);
    expect(sprite.energy).toBe(10);
  });

  it("toBattleState 保留全部调试字段", () => {
    const debug = makeDebug();
    debug.player.active.marks = { "starfall-mark": 4 };
    debug.player.active.statuses = { burn: 2 };
    debug.player.active.counters = { hits: 3 };
    debug.player.active.cooldowns = { "sk-1": 2 };
    const state = toBattleState(debug);
    expect(state.turn).toBe(2);
    expect(state.seed).toBe(7);
    expect(state.weather).toEqual({ id: "sandstorm", turnsLeft: 3 });
    expect(state.player.magic).toBe(3);
    expect(state.player.active.spriteId).toBe("sp-1-1");
    expect(state.player.active.marks).toEqual({ "starfall-mark": 4 });
    expect(state.player.active.statuses).toEqual({ burn: 2 });
    expect(state.player.active.counters).toEqual({ hits: 3 });
    expect(state.player.active.cooldowns).toEqual({ "sk-1": 2 });
    expect(state.player.active.entered).toBe(true);
    expect(state.player.teamMarks).toEqual({ "starfall-mark": 2 });
    expect(state.player.bench.map((b) => b.spriteId)).toEqual(["sp-2-1"]);
    expect(state.enemy.active.spriteId).toBe("sp-3-1");
  });

  it("toDebugState 往返不丢字段", () => {
    const debug = makeDebug();
    debug.enemy.active.debuffs = { atk: -1 };
    const round = toDebugState(toBattleState(debug));
    expect(round).toEqual(debug);
  });
});
