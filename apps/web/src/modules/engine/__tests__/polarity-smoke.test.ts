import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("polarity smoke (incremental)", () => {
  it("掉包：敌方属性增益转为等量减益", () => {
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7180450"];
    state.enemy.active.buffs.atk = 0.5;
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "skill", skillId: "sk-7180450" }, { kind: "energy" }, new Rng(1));
    expect(t1.state.enemy.active.buffs.atk ?? 0).toBe(0);
    expect(t1.state.enemy.active.debuffs.atk).toBe(-0.5);
  });
});
