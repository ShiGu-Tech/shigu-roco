import { describe, expect, it } from "vitest";
import { ActionQueue, MechanismRegistry, MechanismRuntime } from "../mechanisms";
import { loadData } from "../data-node";
import { Rng } from "../rng";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { BattleState } from "../types";

const state = {} as BattleState;

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

  it("lets an actionDeclared mechanism cancel the opponent action in Simulator", () => {
    const bundle = loadData();
    const skillId = Object.entries(bundle.skills).find(([, skill]) =>
      (skill.category === "Physical" || skill.category === "Magic") && Number(skill.power) > 0,
    )?.[0] ?? Object.keys(bundle.skills)[0];
    bundle.mechanisms = [{
      id: "cancel-opponent",
      ownerType: "trait",
      ownerId: "trait-test",
      trigger: "actionDeclared",
      effects: [{ type: "cancelAction", target: "enemy" }],
    }, {
      id: "mark-after-damage",
      ownerType: "trait",
      ownerId: "trait-test",
      trigger: "afterDamage",
      effects: [{ type: "applyStatus", target: "self", statusId: "marked", duration: 2 }],
    }];
    const player = makeActive("sp-7", { hp: 300, maxHp: 300, energy: 10 });
    const enemy = makeActive("sp-10", { hp: 300, maxHp: 300, energy: 10 });
    player.loadout = [skillId];
    enemy.loadout = [skillId];
    const battle = makeState(makeSide(player, { magic: 3 }), makeSide(enemy, { magic: 3 }));
    const result = new Simulator(bundle).step(
      battle,
      { kind: "skill", skillId },
      { kind: "skill", skillId },
      new Rng(7),
    );

    expect(result.phaseLogs.filter((log) => log.startsWith("skill:")).length).toBe(1);
    expect(result.events.some((event) => event.type === "action-cancelled")).toBe(true);
    expect(result.state.player.active.statuses.marked).toBe(1);
  });
});
