import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const bundle = getBundle();
// 巧变：sk-7120300 使用后被随机替换为候选池中的技能（`skill:sk-7120300:improvise`）。
const MID = "skill:sk-7120300:improvise";

function fresh(): BattleState {
  const state = makeState(
    makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
  );
  state.player.active.loadout = ["sk-7120300", "sk-7020360"];
  return state;
}

describe("随机结果覆盖（巧变 / 随机习得 / 随机召唤）", () => {
  it("面板反馈的实际技能优先于引擎自掷", () => {
    const sim = new Simulator(bundle);
    const target = "sk-7120120";

    const forced = sim.step(
      { ...fresh(), randomOverrides: { [MID]: target } },
      { kind: "skill", skillId: "sk-7120300" },
      { kind: "energy" },
      new Rng(1),
    ).state;
    expect(forced.player.active.loadout).toContain(target);
    expect(forced.player.active.loadout).not.toContain("sk-7120300");
  });
});
