import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("迅捷 (D6)", () => {
  it("主动换人入场 → 立刻使用第一个能量足够且带迅捷的技能", () => {
    const bench = makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 });
    bench.loadout = ["sk-7150260"]; // 飞羽（迅捷，能耗 1）
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 }), { bench: [bench] }),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    const t = new Simulator(bundle).step(state, { kind: "switch", benchId: bench.spriteId }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.spriteId).toBe(bench.spriteId);
    expect(t.phaseLogs.some((line) => line.includes("sk-7150260"))).toBe(true);
    expect(t.state.player.active.energy).toBe(9);
  });

  it("能量不足时不触发迅捷", () => {
    const bench = makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 0 });
    bench.loadout = ["sk-7150260"];
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 }), { bench: [bench] }),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    const t = new Simulator(bundle).step(state, { kind: "switch", benchId: bench.spriteId }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.spriteId).toBe(bench.spriteId);
    expect(t.phaseLogs.some((line) => line.includes("sk-7150260"))).toBe(false);
  });
});
