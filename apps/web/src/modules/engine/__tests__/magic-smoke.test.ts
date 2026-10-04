import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("草魔法（战前魔法）", () => {
  it("释放后每回合开始回 15%，持续 3 回合，按方不绑精灵", () => {
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 200, maxHp: 1000, energy: 10 }), { magicChoice: "grass" }),
      makeSide(makeActive("sp-14-1", { hp: 1000, maxHp: 1000, energy: 10 })),
    );
    const sim = new Simulator(bundle);

    // 未释放时草魔法是合法行动。
    expect(sim.legalActions(state, "player").some((a) => a.kind === "magic")).toBe(true);

    // 第 1 回合释放 → 本回合不回血（回合开始已过）。
    let r = sim.step(state, { kind: "magic", magicId: "grass" }, { kind: "energy" }, new Rng(1));
    expect(r.state.player.magicUsed).toBe(true);
    expect(r.state.player.magicActive?.turnsLeft).toBe(3);
    expect(r.state.player.active.hp).toBe(200);

    // 第 2/3/4 回合开始各回 150（15% × 1000）。
    r = sim.step(r.state, { kind: "energy" }, { kind: "energy" }, new Rng(2));
    expect(r.state.player.active.hp).toBe(350);
    r = sim.step(r.state, { kind: "energy" }, { kind: "energy" }, new Rng(3));
    expect(r.state.player.active.hp).toBe(500);
    r = sim.step(r.state, { kind: "energy" }, { kind: "energy" }, new Rng(4));
    expect(r.state.player.active.hp).toBe(650);
    expect(r.state.player.magicActive).toBeUndefined();

    // 已释放 → 不再是合法行动。
    expect(sim.legalActions(r.state, "player").some((a) => a.kind === "magic")).toBe(false);
  });
});
