import { describe, expect, it } from "vitest";

import { MechanismRegistry, MechanismRuntime } from "../mechanisms";
import { cloneState } from "../state";
import type { BattleState } from "../types";

/** 试验台 · 特性开关（traitEnabled）：默认启用，false 时按「图鉴归属的 trait 机制」跳过。
 *  `traitMechanisms` = 图鉴侧给该精灵挂的 `trait:*` 机制 id（与 ownerId 不必相等）。 */
function baseState(traitEnabled?: boolean, opts: { spriteId?: string; traitMechanisms?: string[] } = {}): BattleState {
  const side = (spriteId: string, mechanisms?: string[]) => ({
    magic: 0,
    active: {
      spriteId,
      hp: 100,
      maxHp: 100,
      energy: 0,
      loadout: [],
      buffs: {},
      debuffs: {},
      marks: {},
      statuses: {},
      ...(traitEnabled === undefined ? {} : { traitEnabled }),
      ...(mechanisms ? { traitMechanisms: mechanisms } : {}),
    },
    bench: [],
    seenEnemy: [],
    wishChargesLeft: 0,
    wishCooldown: 0,
    leaderUsed: false,
  });
  return {
    turn: 1,
    weather: null,
    seed: 1,
    player: side(opts.spriteId ?? "sp-a", opts.traitMechanisms ?? ["trait:t"]),
    enemy: side("sp-b"),
  } as unknown as BattleState;
}

describe("试验台 · 特性开关（traitEnabled）", () => {
  const runtime = new MechanismRuntime(
    new MechanismRegistry([
      {
        id: "trait:t",
        ownerType: "trait",
        ownerId: "sp-a",
        trigger: "turnStart",
        effects: [{ type: "modifyEnergy", target: "self", delta: 1 }],
      },
    ]),
  );

  const ctx = (state: BattleState) => ({
    state,
    trigger: "turnStart" as const,
    actorSide: "player" as const,
    targetSide: "enemy" as const,
    event: {},
  });

  it("默认（undefined）启用：特性机制照常派发", () => {
    expect(runtime.dispatch(ctx(baseState())).length).toBe(1);
  });

  it("traitEnabled=false：该精灵的特性机制被跳过", () => {
    expect(runtime.dispatch(ctx(baseState(false))).length).toBe(0);
  });

  it("traitEnabled=true：显式启用同样派发", () => {
    expect(runtime.dispatch(ctx(baseState(true))).length).toBe(1);
  });

  it("共享特性（ownerId 与精灵 id 不同）：按图鉴归属也能关掉", () => {
    // 机制挂在基础形态 sp-base 下，实际生效精灵是进化形态 sp-evolved（图鉴把它算作归属）。
    const shared = new MechanismRuntime(
      new MechanismRegistry([
        {
          id: "trait:sp-base",
          ownerType: "trait",
          ownerId: "sp-base",
          trigger: "turnStart",
          effects: [{ type: "modifyEnergy", target: "self", delta: 1 }],
        },
      ]),
    );
    const evolved = { spriteId: "sp-evolved", traitMechanisms: ["trait:sp-base"] };
    expect(shared.dispatch(ctx(baseState(undefined, evolved))).length).toBe(1);
    expect(shared.dispatch(ctx(baseState(false, evolved))).length).toBe(0);
  });

  it("cloneState 保留 traitEnabled / traitMechanisms（回合结算克隆不丢开关）", () => {
    const st = baseState(false, { spriteId: "sp-48-1", traitMechanisms: ["trait:sp-47-1"] });
    const cloned = cloneState(st);
    expect(cloned.player.active.traitEnabled).toBe(false);
    expect(cloned.player.active.traitMechanisms).toEqual(["trait:sp-47-1"]);
  });
});
