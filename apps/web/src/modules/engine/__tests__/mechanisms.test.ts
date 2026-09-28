import { describe, expect, it } from "vitest";
import { ActionQueue, MechanismRegistry } from "../mechanisms";
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
