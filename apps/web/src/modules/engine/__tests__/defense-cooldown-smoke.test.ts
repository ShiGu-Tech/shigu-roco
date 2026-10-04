import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function damagingSkill(spriteId: string, element?: string): string {
  for (const id of (bundle.sprites[spriteId]?.skillList as string[]) ?? []) {
    const skill = bundle.skills[id];
    if (!skill || Number(skill.power) <= 0) continue;
    if (element && skill.element !== element) continue;
    return id;
  }
  throw new Error("no damaging skill");
}

describe("defense shared cooldown (术语 1016)", () => {
  it("使用防御技能后，携带的防御技能进入 1 回合冷却", () => {
    const def1 = "sk-7090200"; // 冰天雪地（防御）
    const def2 = "sk-7090350"; // 雪替身（防御）
    const atk = damagingSkill("sp-8-1");
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 600, maxHp: 600, energy: 10 })),
    );
    state.player.active.loadout = [def1, def2, atk];
    const sim = new Simulator(bundle);
    const t1 = sim.step(state, { kind: "skill", skillId: def1 }, { kind: "energy" }, new Rng(1));
    expect(t1.state.player.active.cooldowns?.[def1] ?? 0).toBeGreaterThanOrEqual(1);
    expect(t1.state.player.active.cooldowns?.[def2] ?? 0).toBeGreaterThanOrEqual(1);
    // 下个回合不再使用防御技能 → 冷却递减归零。
    const t2 = sim.step(t1.state, { kind: "skill", skillId: atk }, { kind: "energy" }, new Rng(2));
    expect(t2.state.player.active.cooldowns?.[def2] ?? 0).toBe(0);
  });
});

describe("skill mechanism loadout gate", () => {
  it("未携带能量刃时，应对成功不产生能量刃的永久修正", () => {
    const def1 = "sk-7090200"; // 冰天雪地：应对攻击
    const enemyAtk = damagingSkill("sp-14-1");
    const state = makeState(
      makeSide(makeActive("sp-8-1", { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 600, maxHp: 600, energy: 10 })),
    );
    state.player.active.loadout = [def1];
    state.enemy.active.loadout = [enemyAtk];
    const sim = new Simulator(bundle);
    const t = sim.step(state, { kind: "skill", skillId: def1 }, { kind: "skill", skillId: enemyAtk }, new Rng(1));
    const spurious = t.events.some((e) => e.type === "skill-modified" && (e.data as Dict).skillId === "sk-7020570");
    expect(spurious).toBe(false);
  });
});
