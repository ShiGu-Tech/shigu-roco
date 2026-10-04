import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("team/history counters smoke (P1)", () => {
  it("开局预计算队伍 / 携带统计，技能 / 聚能 / 力竭自增", () => {
    const skill = "sk-7020360"; // 抓挠 · Normal / Attack / cost 0
    const state = makeState(
      makeSide(makeActive("sp-1-1", { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    state.player.active.loadout = [skill];
    state.enemy.active.loadout = [skill];
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "skill", skillId: skill }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.counters?.teamLight).toBeGreaterThanOrEqual(1);
    expect(t1.state.player.counters?.loadoutNormal).toBe(1);
    expect(t1.state.player.counters?.loadoutElements).toBe(1);
    expect(t1.state.player.counters?.skillUsed).toBe(1);
    expect(t1.state.player.counters?.usedNormal).toBe(1);
    expect(t1.state.player.counters?.usedTypeAttack).toBe(1);
    expect(t1.state.enemy.counters?.charges).toBe(1);
  });
});
