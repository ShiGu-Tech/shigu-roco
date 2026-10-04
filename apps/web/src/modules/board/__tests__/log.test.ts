import { describe, expect, it } from "vitest";

import type { BattleEvent, Catalog } from "@/modules/battle/types";

import { describeEvent, mechanismHitOf } from "../log";

const cat = {} as Catalog;

function ev(type: string, data: Record<string, unknown> = {}, side = "player"): BattleEvent {
  return { type, side, text: "", data };
}

describe("board log", () => {
  it("纯机制事件翻中文（不残留英文 id / 效果名）", () => {
    const event = ev("loadout-rotated", { trigger: "turnStart", mechanismId: "skill:sk-1:transmission", effectType: "rotateLoadout" });
    const text = describeEvent(event, cat);
    expect(text).toContain("回合开始");
    expect(text).toContain("技能栏轮转");
    expect(text).not.toContain("loadout-rotated");
    expect(text).not.toContain("skill:sk-1");
  });

  it("mechanismHitOf：纯机制命中，叙事 / 原生事件不命中", () => {
    const mech = ev("loadout-rotated", { trigger: "turnStart", mechanismId: "skill:sk-1:transmission", effectType: "rotateLoadout" });
    expect(mechanismHitOf(mech)).toEqual({ trigger: "turnStart", mechanismId: "skill:sk-1:transmission", effectType: "rotateLoadout" });

    const damage = ev("damage", { trigger: "beforeAction", mechanismId: "skill:sk-1", effectType: "dealDamage", value: 10 });
    expect(mechanismHitOf(damage)).toBeNull();

    const native = ev("some-native", {});
    expect(mechanismHitOf(native)).toBeNull();
  });
});
