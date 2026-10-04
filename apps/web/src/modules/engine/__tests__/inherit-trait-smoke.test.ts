import { describe, expect, it } from "vitest";
import { MechanismRegistry, MechanismRuntime, type MechanismDefinition } from "../mechanisms";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";

const bundle = getBundle();

describe("动态归属：触发型特性继承（铭记于月亮）", () => {
  it("DSL 路径：已继承精灵按原精灵身份派发触发型机制", () => {
    const defs: MechanismDefinition[] = [
      {
        id: "trait:own-1",
        ownerType: "trait",
        ownerId: "own-1",
        trigger: "turnStart",
        when: [{ path: "self.active.spriteId", op: "eq", value: "own-1" }],
        effects: [{ type: "addCounter", target: "self", key: "fired", delta: 1 }],
      },
    ];
    const runtime = new MechanismRuntime(new MechanismRegistry(defs));
    const heir = makeActive("heir-1", { hp: 100, maxHp: 100, energy: 10 });
    const state = makeState(makeSide(heir), makeSide(makeActive("foe-1")));
    const context = { state, trigger: "turnStart" as const, actorSide: "player" as const, targetSide: "enemy" as const, event: { side: "player" } };

    expect(runtime.dispatch(context).some((c) => c.mechanismId === "trait:own-1")).toBe(false);
    heir.inheritedFrom = ["own-1"];
    expect(runtime.dispatch(context).some((c) => c.mechanismId === "trait:own-1")).toBe(true);
  });

  it("程序路径（真实数据）：继承「铃兰晚钟」后入场时按其身份失去半血", () => {
    const heir = makeActive("sp-443-1", { hp: 400, maxHp: 400, energy: 10 });
    const state = makeState(makeSide(heir), makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })));
    const sim = new Simulator(bundle);
    const event = { enteredSpriteId: "sp-443-1", first: true };

    expect(sim.mechanisms.dispatch({ state, trigger: "onEntry", actorSide: "player", targetSide: "enemy", event }).some((c) => c.mechanismId.startsWith("trait:sp-201-1"))).toBe(false);

    heir.inheritedFrom = ["sp-201-1"];
    expect(sim.mechanisms.dispatch({ state, trigger: "onEntry", actorSide: "player", targetSide: "enemy", event }).some((c) => c.mechanismId.startsWith("trait:sp-201-1"))).toBe(true);
  });

  it("整局：继承后首次入场实际扣血", () => {
    const heir = makeActive("sp-443-1", { hp: 400, maxHp: 400, energy: 10 });
    heir.inheritedFrom = ["sp-201-1"];
    const state = makeState(makeSide(heir), makeSide(makeActive("sp-14-1", { hp: 400, maxHp: 400, energy: 10 })));
    const r = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(r.state.player.active.hp).toBeLessThanOrEqual(200);
  });
});
