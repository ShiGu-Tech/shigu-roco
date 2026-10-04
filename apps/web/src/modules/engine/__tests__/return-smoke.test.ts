import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

function fresh() {
  return makeState(
    makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
  );
}

describe("返场 (returnField)", () => {
  it("踏雷：回合末返场，重置入场标记（下回合首动为迸发）", () => {
    const state = fresh();
    state.player.active.loadout = ["sk-7110460"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7110460" }, { kind: "energy" }, new Rng(1));
    expect(t.events.some((e) => e.type === "returned")).toBe(true);
    expect(t.state.player.active.actedSinceEntry).toBe(false);
    expect(t.state.player.active.returnedThisTurn).toBeFalsy();
  });

  it("龙守望·暗：应对防御 → 敌方下回合眩晕", () => {
    const state = fresh();
    state.player.active.loadout = ["sk-7100300"];
    state.enemy.active.loadout = ["sk-7090200"]; // 冰天雪地（防御）
    const t = new Simulator(bundle).step(
      state,
      { kind: "skill", skillId: "sk-7100300", choice: 1 },
      { kind: "skill", skillId: "sk-7090200" },
      new Rng(1),
    );
    expect(t.state.enemy.active.counters?.stun ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("过载回路：回合末返场", () => {
    const state = fresh();
    state.player.active.loadout = ["sk-7110360"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7110360" }, { kind: "energy" }, new Rng(1));
    expect(t.events.some((e) => e.type === "returned")).toBe(true);
    expect(t.state.player.active.actedSinceEntry).toBe(false);
  });
});
