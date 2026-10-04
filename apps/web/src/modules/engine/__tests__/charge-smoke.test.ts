import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

function damagingSkill(spriteId: string): string {
  const sprite = bundle.sprites[spriteId];
  for (const id of (sprite?.skillList as string[]) ?? []) {
    const skill = bundle.skills[id];
    if (skill && (skill.category === "Physical" || skill.category === "Magic") && Number(skill.power) > 0) return id;
  }
  throw new Error("no damaging skill");
}

describe("charge smoke (A3)", () => {
  it("蓄力：使用当回合不造成伤害，下回合自动释放", () => {
    const state = makeState(
      makeSide(makeActive("sp-1-1", { hp: 400, maxHp: 400, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })),
    );
    state.player.active.loadout = ["sk-7100150"]; // 升龙咆哮（蓄力）
    const sim = new Simulator(bundle);
    const enemySkill = damagingSkill("sp-14-1");

    // 第 1 回合：我方用蓄力技 → 敌方未受伤，我方进入蓄力
    const t1 = sim.step(state, { kind: "skill", skillId: "sk-7100150" }, { kind: "skill", skillId: enemySkill }, new Rng(1));
    expect(t1.events.some((e) => e.type === "skill-charged")).toBe(true);
    expect(t1.state.player.active.pendingSkill?.skillId).toBe("sk-7100150");

    // 第 2 回合：即使输入别的技能，也会自动释放升龙咆哮 → 敌方受伤
    const t2 = sim.step(t1.state, { kind: "energy" }, { kind: "skill", skillId: enemySkill }, new Rng(2));
    expect(t2.state.player.active.pendingSkill).toBeUndefined();
    const dealt = t2.events.some((e) => e.type === "damage" && e.side === "enemy");
    expect(dealt).toBe(true);
  });
});
