import { describe, expect, it } from "vitest";
import { effectiveCost } from "../cost";
import { getBundle } from "../server";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("cost rules smoke (incremental)", () => {
  it("对流/倾轧：signFlip 反转增减、changeMul 放大变化", () => {
    const state = makeState(
      makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })),
    );
    const skill = "sk-7020360";
    const base = Number(bundle.skills[skill].cost) || 0;
    state.player.active.costMods = [{ key: "t", source: "system", scope: "all", delta: 2, duration: "permanent", dispellable: false, hidden: false }];
    expect(effectiveCost(state, bundle, "player", skill)).toBe(base + 2);
    expect(effectiveCost(state, bundle, "player", skill, { "cost.signFlip": true })).toBe(Math.max(0, base - 2));
    expect(effectiveCost(state, bundle, "player", skill, { "cost.changeMul": 2 })).toBe(base + 4);
  });
});
