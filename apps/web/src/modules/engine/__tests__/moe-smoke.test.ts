import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function spriteWithPrev(): [string, string] {
  for (const [id, sp] of Object.entries(bundle.sprites as Record<string, Dict>)) {
    if (typeof sp.prev === "string" && sp.prev) return [id, sp.prev];
  }
  throw new Error("no sprite with prev");
}

describe("萌化退化 (D8)", () => {
  it("对手使用捧杀使敌方获得萌化 → 退化到上一阶并降低 maxHp", () => {
    const [enemyId, prevId] = spriteWithPrev();
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive(enemyId, { hp: 600, maxHp: 600, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7160290"];
    state.enemy.active.loadout = ["sk-7020550"]; // 魔能爆（攻击技，触发应对）
    const beforeMax = state.enemy.active.maxHp;
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7160290" }, { kind: "skill", skillId: "sk-7020550" }, new Rng(1));
    expect(t.state.enemy.active.spriteId).toBe(prevId);
    expect(t.state.enemy.active.statuses.moe ?? 0).toBeGreaterThanOrEqual(1);
    expect(t.state.enemy.active.maxHp).toBeLessThan(beforeMax);
  });

  it("示弱：自己萌化（退化一阶）并获得永久速度计数器", () => {
    const [playerId, prevId] = spriteWithPrev();
    const state = makeState(
      makeSide(makeActive(playerId, { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7160170"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7160170" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.spriteId).toBe(prevId);
    expect(t.state.player.active.counters?.["flat-speed"] ?? 0).toBe(130);
  });

  it("反弹：把自己的萌化转移给敌方", () => {
    const [id, prevId] = spriteWithPrev();
    const state = makeState(
      makeSide(makeActive(id, { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive(id, { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.player.active.statuses = { moe: 1 };
    state.player.active.loadout = ["sk-7160190"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7160190" }, { kind: "energy" }, new Rng(1));
    expect(t.state.enemy.active.statuses.moe ?? 0).toBeGreaterThanOrEqual(1);
    expect(t.state.enemy.active.spriteId).toBe(prevId);
  });
});
