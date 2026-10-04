import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function findSkill(pred: (s: Dict) => boolean): string {
  for (const s of Object.values(bundle.skills as Record<string, Dict>)) if (pred(s)) return String(s.id);
  throw new Error("no skill");
}

function damageOn(events: { type: string; side?: string | null; data: Dict }[]): number {
  return events.filter((e) => e.type === "damage" && e.side === "enemy").reduce((sum, e) => sum + Number(e.data.value ?? 0), 0);
}

describe("萌化/变身族特性", () => {
  it("自由飘：每层萌化增加连击（伤害更高）", () => {
    const atk = findSkill((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0);
    const run = (moe: number) => {
      const state = makeState(
        makeSide(makeActive("sp-102-1", { hp: 999, maxHp: 999, energy: 20 })),
        makeSide(makeActive("sp-14-1", { hp: 99999, maxHp: 99999, energy: 10 })),
      );
      state.player.active.loadout = [atk, "sk-7020550", "sk-7021120", "sk-7090200"];
      if (moe) state.player.active.statuses = { moe };
      return new Simulator(bundle).step(state, { kind: "skill", skillId: atk }, { kind: "energy" }, new Rng(1));
    };
    expect(damageOn(run(1).events as never)).toBeGreaterThan(damageOn(run(0).events as never));
  });

  it("腾挪：攻击技能应对成功后变为棋绮后", () => {
    const reactAtk = findSkill((s) => s.reaction === "Status" && (s.category === "Physical" || s.category === "Magic"));
    const statusSkill = findSkill((s) => s.actionType === "Status" && s.category === "Status");
    const state = makeState(
      makeSide(makeActive("sp-188-1", { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [reactAtk];
    state.enemy.active.loadout = [statusSkill];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: reactAtk }, { kind: "skill", skillId: statusSkill }, new Rng(1));
    expect(t.state.player.active.spriteId).toBe("sp-192-1");
  });
});
