import { describe, expect, it } from "vitest";
import { ActionQueue, MechanismRegistry, MechanismRuntime } from "../mechanisms";
import type { EffectCommand } from "../mechanisms";
import { Rng } from "../rng";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState, revertSkillOverride } from "../state";
import type { BattleState, DataBundle } from "../types";

const state = {} as BattleState;

function command(definition: EffectCommand["definition"]): EffectCommand {
  return { type: definition.type, definition, mechanismId: "test", trigger: "beforeAction", actorSide: "player", targetSide: "enemy" };
}

const miniBundle: DataBundle = {
  sprites: {
    "sp-a": { id: "sp-a", elements: ["Normal"], race: { hp: 120, atk: 60, spatk: 60, defense: 60, spdef: 60, speed: 60 }, skillList: ["sk-1"] },
    "sp-b": { id: "sp-b", elements: ["Normal"], race: { hp: 120, atk: 60, spatk: 60, defense: 60, spdef: 60, speed: 60 }, skillList: ["sk-1"] },
  },
  skills: {
    "sk-1": { id: "sk-1", skillName: "撞击", element: "Normal", category: "Physical", power: 40, cost: 0 },
    "sk-2": { id: "sk-2", skillName: "换招", element: "Normal", category: "Physical", power: 40, cost: 0 },
  },
  marks: {},
  weather: {},
  elements: { elements: [], matrix: {}, values: {}, combine: {} },
  rules: { energy: { max: 10 }, magic: { perFaint: 1 } },
  stats: {},
  assets: {},
  mechanisms: [
    { id: "start", ownerType: "trait", ownerId: "t", trigger: "battleStart", effects: [{ type: "modifyEnergy", target: "player", delta: 2 }] },
    { id: "enter", ownerType: "trait", ownerId: "t", trigger: "afterSwitch", effects: [{ type: "modifyEnergy", target: "player", delta: 5 }] },
    { id: "used", ownerType: "skill", ownerId: "sk-1", trigger: "skillUsed", when: [{ path: "event.skillId", op: "eq", value: "sk-1" }], effects: [{ type: "modifyMagic", target: "target", delta: -1 }] },
    { id: "freeze-extra", ownerType: "trait", ownerId: "t", trigger: "statusApplied", when: [{ path: "event.statusId", op: "eq", value: "frozen" }], effects: [{ type: "modifyEnergy", target: "self", delta: -3 }] },
  ],
  warnings: [],
  dataVersion: "test",
  dataUpdatedAt: "2026-09-29T00:00:00.000Z",
};

describe("mechanism extension layer", () => {
  it("collects matching mechanisms by priority and keeps effect order", () => {
    const registry = new MechanismRegistry([
      {
        id: "low",
        ownerType: "trait",
        ownerId: "trait-a",
        trigger: "actionDeclared",
        priority: 1,
        when: [{ path: "event.action.kind", op: "eq", value: "skill" }],
        effects: [{ type: "modifyCooldown", delta: -1 }],
      },
      {
        id: "high",
        ownerType: "skill",
        ownerId: "skill-a",
        trigger: "actionDeclared",
        priority: 10,
        effects: [{ type: "forceFirst" }, { type: "cancelAction" }],
      },
    ]);

    const commands = registry.collect({
      state,
      trigger: "actionDeclared",
      event: { action: { kind: "skill" } },
      actorSide: "player",
    });

    expect(commands.map((command) => command.mechanismId)).toEqual(["high", "high", "low"]);
    expect(commands[0].type).toBe("forceFirst");
  });

  it("does not collect a mechanism when its condition does not match", () => {
    const registry = new MechanismRegistry([
      {
        id: "defense-counter",
        ownerType: "skill",
        ownerId: "counter",
        trigger: "actionDeclared",
        when: [{ path: "event.action.kind", op: "eq", value: "defend" }],
        effects: [{ type: "forceFirst" }],
      },
    ]);

    expect(registry.collect({ state, trigger: "actionDeclared", event: { action: { kind: "skill" } } })).toHaveLength(0);
  });
});

describe("action queue", () => {
  it("orders priority before speed and supports cancellation", () => {
    const queue = new ActionQueue();
    queue.enqueue({ id: "slow-priority", actorSide: "player", action: { kind: "skill" }, declaredAt: 0, priority: 0, speedSnapshot: 999, status: "queued" });
    queue.enqueue({ id: "high-priority", actorSide: "enemy", action: { kind: "skill" }, declaredAt: 1, priority: 1, speedSnapshot: 1, status: "queued" });
    queue.enqueue({ id: "cancelled", actorSide: "player", action: { kind: "skill" }, declaredAt: 2, priority: 99, speedSnapshot: 999, status: "queued" });

    expect(queue.cancel("cancelled")).toBe(true);
    expect(queue.ordered().map((entry) => entry.id)).toEqual(["high-priority", "slow-priority"]);
    expect(queue.forceFirst("slow-priority")).toBe(true);
    expect(queue.ordered()[0].id).toBe("slow-priority");
  });
});

describe("mechanism state transaction", () => {
  it("applies status and magic commands to the selected target", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = makeState(
      makeSide(makeActive("player", { hp: 100, maxHp: 100 }), { magic: 3 }),
      makeSide(makeActive("enemy", { hp: 100, maxHp: 100 }), { magic: 3 }),
    );
    const status = {
      type: "applyStatus" as const,
      definition: { type: "applyStatus" as const, target: "target", statusId: "frozen", duration: 3 },
      mechanismId: "freeze",
      trigger: "actionResolved" as const,
      actorSide: "player" as const,
      targetSide: "enemy" as const,
    };
    const magic = {
      type: "modifyMagic" as const,
      definition: { type: "modifyMagic" as const, target: "enemy", delta: -1 },
      mechanismId: "magic-loss",
      trigger: "actionResolved" as const,
      actorSide: "player" as const,
      targetSide: "enemy" as const,
    };

    runtime.applyStateCommands(battle, [status, magic]);
    expect(battle.enemy.active.statuses.frozen).toBe(3);
    expect(battle.enemy.magic).toBe(2);
  });
});

describe("skill pool commands", () => {
  it("learns, replaces and forgets skills in the loadout", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })),
    );
    battle.player.active.loadout = ["sk-1", "sk-3"];
    runtime.applyStateCommands(battle, [
      command({ type: "learnSkill", target: "self", skillId: "sk-x" }),
      command({ type: "replaceSkill", target: "self", fromSkillId: "sk-1", toSkillId: "sk-2" }),
      command({ type: "forgetSkill", target: "self", skillId: "sk-3" }),
    ]);
    expect(battle.player.active.loadout).toEqual(["sk-2", "sk-x"]);
  });

  it("randomizes deterministically and records a revert-on-use override", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })),
    );
    battle.player.active.loadout = ["sk-1"];
    runtime.applyStateCommands(battle, [command({ type: "randomizeSkill", target: "self", skillId: "sk-1", source: ["sk-2", "sk-3"] })]);
    const active = battle.player.active;
    expect(["sk-2", "sk-3"]).toContain(active.loadout[0]);
    expect(active.skillOverrides?.[active.loadout[0]]).toEqual({ original: "sk-1", expires: 0 });
    revertSkillOverride(active, active.loadout[0]);
    expect(active.loadout).toEqual(["sk-1"]);
  });
});

describe("trigger cascade", () => {
  it("dispatches statusApplied and applies cascaded effects", () => {
    const registry = new MechanismRegistry([
      { id: "freeze-extra", ownerType: "trait", ownerId: "t", trigger: "statusApplied", when: [{ path: "event.statusId", op: "eq", value: "frozen" }], effects: [{ type: "modifyEnergy", target: "self", delta: -3 }] },
    ]);
    const runtime = new MechanismRuntime(registry);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100, energy: 8 })),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100, energy: 8 })),
    );
    runtime.applyStateCommands(battle, [command({ type: "applyStatus", target: "target", statusId: "frozen", duration: 2 })]);
    expect(battle.enemy.active.statuses.frozen).toBe(2);
    expect(battle.enemy.active.energy).toBe(5);
  });
});

describe("simulator trigger dispatch", () => {
  it("fires battleStart, skillUsed and afterSwitch", () => {
    const sim = new Simulator(miniBundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 }), { bench: [makeActive("sp-b", { hp: 200, maxHp: 200 })] }),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200 })),
      { turn: 1, seed: 7 },
    );
    battle.player.active.loadout = ["sk-1"];
    battle.enemy.active.loadout = ["sk-1"];
    const result = sim.step(battle, { kind: "skill", skillId: "sk-1" }, { kind: "skill", skillId: "sk-1" }, new Rng(7));
    expect(result.state.player.active.energy).toBe(7);
    expect(result.state.enemy.magic).toBe(3);
    sim.forcedSwitch(result.state, "player", "sp-b");
    expect(result.state.player.active.energy).toBe(5);
  });
});
