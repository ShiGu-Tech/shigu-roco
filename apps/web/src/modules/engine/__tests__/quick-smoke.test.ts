import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

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

  it("疾风连袭：能耗 = floor(已用迅捷能耗 / 2) + 使用次数", () => {
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7150260", "sk-7150320"];
    const sim = new Simulator(bundle);
    let s = sim.step(state, { kind: "skill", skillId: "sk-7150260" }, { kind: "energy" }, new Rng(1)).state;
    s = sim.step(s, { kind: "skill", skillId: "sk-7150320" }, { kind: "energy" }, new Rng(2)).state;
    const before = s.player.active.energy;
    s = sim.step(s, { kind: "skill", skillId: "sk-7150320" }, { kind: "energy" }, new Rng(3)).state;
    expect(before - s.player.active.energy).toBe(1);
  });

  it("快锤特性：能耗 < 3 的技能视为迅捷（换入即出手）", () => {
    const hammer = Object.entries(bundle.sprites as Record<string, Dict>).find(([, v]) => (v.trait as Dict | undefined)?.name === "快锤")?.[0];
    expect(hammer).toBeTruthy();
    const cheap = Object.values(bundle.skills as Record<string, Dict>).find(
      (s) => Number(s.cost) < 3 && s.quick !== true && (s.category === "Physical" || s.category === "Magic"),
    ) as { id: string } | undefined;
    if (!cheap) throw new Error("no cheap non-quick skill");
    const bench = makeActive(hammer!, { hp: 500, maxHp: 500, energy: 10 });
    bench.loadout = [cheap.id];
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 }), { bench: [bench] }),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    const t = new Simulator(bundle).step(state, { kind: "switch", benchId: bench.spriteId }, { kind: "energy" }, new Rng(1));
    expect(t.phaseLogs.some((line) => line.includes(cheap.id))).toBe(true);
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
