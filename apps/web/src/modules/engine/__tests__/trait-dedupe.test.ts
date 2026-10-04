import { describe, expect, it } from "vitest";
import { effectiveCost } from "../cost";
import type { MechanismDefinition } from "../mechanisms";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();
const mechanisms = bundle.mechanisms as MechanismDefinition[];
const ids = new Set(mechanisms.map((m) => m.id));

describe("特性机制去重（C4 冗余副本）", () => {
  it("缩壳：板板壳用防御反击 3-2=1（不再双减为 0）", () => {
    const state = makeState(
      makeSide(makeActive("sp-12-1", { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7140300", "sk-7020360"];
    const sim = new Simulator(bundle);
    const s1 = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1)).state;
    expect(effectiveCost(s1, bundle, "player", "sk-7140300")).toBe(1);
    const before = s1.player.active.energy;
    const s2 = sim.step(s1, { kind: "skill", skillId: "sk-7140300" }, { kind: "energy" }, new Rng(2)).state;
    expect(before - s2.player.active.energy).toBe(1);
  });

  it("浸润：使用水系技能后只减 1（不再双减）", () => {
    const water = Object.values(bundle.skills).find((s) => s.element === "Water" && Number(s.cost) >= 1) as { id: string };
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 500, maxHp: 500, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    state.player.active.loadout = [water.id, "sk-7020360"];
    const sim = new Simulator(bundle);
    const s1 = sim.step(state, { kind: "skill", skillId: water.id }, { kind: "energy" }, new Rng(1)).state;
    const costMods = s1.player.active.costMods ?? [];
    expect(costMods.filter((m) => m.sourceId === "sp-8-1").length).toBe(1);
  });

  it("上锁：sp-380-1 只由自身机制覆盖，sp-379-1 不再误盖", () => {
    const lock379 = mechanisms.find((m) => m.id === "trait:sp-379-1");
    expect(JSON.stringify(lock379?.when)).not.toContain("sp-380-1");
    expect(ids.has("trait:sp-380-1")).toBe(true);
  });

  it("冗余副本已从数据中移除", () => {
    for (const id of ["trait:sp-12-1#2", "trait:sp-8-1#2", "trait:sp-10-2#2", "trait:sp-139-1#2", "trait:sp-142-1#2", "trait:sp-159-1#2", "trait:sp-171-1#2", "trait:sp-373-1#2", "trait:sp-409-1#2", "trait:sp-4-3#3", "trait:sp-427-1", "trait:sp-427-1#2"]) {
      expect(ids.has(id), id).toBe(false);
    }
  });
});
