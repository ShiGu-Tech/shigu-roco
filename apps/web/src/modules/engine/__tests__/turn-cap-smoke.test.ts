import { describe, expect, it } from "vitest";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();
const sim = new Simulator(bundle);

function atTurn(turn: number, playerMagic: number, enemyMagic: number, playerBench = 0, enemyBench = 0): BattleState {
  const bench = (n: number) => Array.from({ length: n }, () => makeActive("sp-14-1", { hp: 300, maxHp: 300 }));
  const state = makeState(
    makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 }), { magic: playerMagic, bench: bench(playerBench) }),
    makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 }), { magic: enemyMagic, bench: bench(enemyBench) }),
  );
  state.turn = turn;
  return state;
}

describe("回合上限终局（PVP 50 回合）", () => {
  it("未到上限且双方存活 → 不结束", () => {
    expect(sim.terminal(atTurn(50, 3, 3)).ended).toBe(false);
  });

  it("超过 50 回合 → 强制结束，剩余魔力多者胜", () => {
    const t = sim.terminal(atTurn(51, 4, 3));
    expect(t.ended).toBe(true);
    expect(t.winner).toBe("player");
    expect(t.reason).toContain("50 回合上限");
  });

  it("魔力相同 → 存活精灵数多者胜", () => {
    const t = sim.terminal(atTurn(51, 3, 3, 2, 0));
    expect(t.winner).toBe("player");
  });

  it("魔力 / 存活数 / 生命占比全同 → 平局", () => {
    const t = sim.terminal(atTurn(51, 3, 3));
    expect(t.ended).toBe(true);
    expect(t.winner).toBeNull();
    expect(t.reason).toContain("平局");
  });
});
