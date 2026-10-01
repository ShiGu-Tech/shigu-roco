import { describe, expect, it } from "vitest";
import { ActionQueue, MechanismRegistry, MechanismRuntime } from "../mechanisms";
import type { EffectCommand, MechanismDefinition } from "../mechanisms";
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
    "sk-1": { id: "sk-1", skillName: "撞击", element: "Normal", category: "Physical", actionType: "Attack", power: 40, cost: 0 },
    "sk-2": { id: "sk-2", skillName: "换招", element: "Normal", category: "Physical", actionType: "Attack", power: 40, cost: 0 },
  },
  statuses: {},
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
      definition: { type: "applyStatus" as const, target: "target", statusId: "frozen", layers: 3 },
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

describe("mark stacking", () => {
  it("accumulates mark layers up to the stack cap", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
    const bundle: DataBundle = { ...miniBundle, marks: { "starfall-mark": { id: "starfall-mark", name: "星陨印记", maxStack: 10 } } };
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 4 })], bundle);
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 4 })], bundle);
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 4 })], bundle);
    expect(st.enemy.active.marks["starfall-mark"]).toBe(10);
  });

  const twoMarks: DataBundle = {
    ...miniBundle,
    marks: { "starfall-mark": { id: "starfall-mark", name: "星陨印记", maxStack: 10 }, "attack-mark": { id: "attack-mark", name: "攻击印记", maxStack: 10 } },
  };

  it("a different mark replaces the existing ones (mutual exclusion)", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 3 })], twoMarks);
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "attack-mark", layers: 1 })], twoMarks);
    expect(st.enemy.active.marks["attack-mark"]).toBe(1);
    expect(st.enemy.active.marks["starfall-mark"]).toBeUndefined();
  });

  it("a passive setRuleModifier overrides the rule so granted marks coexist (吟游之弦)", () => {
    const bundle: DataBundle = {
      ...twoMarks,
      mechanisms: [
        ...(twoMarks.mechanisms ?? []),
        {
          id: "trait:bard",
          ownerType: "trait",
          ownerId: "sp-a",
          trigger: "passive",
          when: [{ path: "self.active.spriteId", op: "eq", value: "sp-a" }],
          effects: [{ type: "setRuleModifier", target: "self", key: "marks.replaceDifferent", value: false }],
        },
      ],
    };
    const runtime = new MechanismRuntime(new MechanismRegistry(bundle.mechanisms as MechanismDefinition[]));
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 3 })], bundle);
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "attack-mark", layers: 2 })], bundle);
    expect(st.enemy.active.marks["starfall-mark"]).toBe(3);
    expect(st.enemy.active.marks["attack-mark"]).toBe(2);
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
    runtime.applyStateCommands(battle, [command({ type: "applyStatus", target: "target", statusId: "frozen", layers: 2 })]);
    expect(battle.enemy.active.statuses.frozen).toBe(2);
    expect(battle.enemy.active.energy).toBe(5);
  });
});

describe("damage modifiers (beforeDamage)", () => {
  function battle() {
    return makeState(
      makeSide(makeActive("sp-a", { hp: 1000, maxHp: 1000 })),
      makeSide(makeActive("sp-b", { hp: 1000, maxHp: 1000 })),
    );
  }
  const dealDamage: EffectCommand = {
    type: "dealDamage",
    definition: { type: "dealDamage", target: "target", category: "Physical", power: 40, skillId: "sk-1" },
    mechanismId: "sk-1",
    trigger: "beforeAction",
    actorSide: "player",
    targetSide: "enemy",
  };

  function run(defs: MechanismDefinition[] = []) {
    const runtime = new MechanismRuntime(new MechanismRegistry(defs));
    const st = battle();
    const [event] = runtime.applyDamageCommands(st, miniBundle, [dealDamage]);
    return event;
  }

  it("collects outgoing/incoming multipliers, reduction and hits", () => {
    const event = run([
      {
        id: "dmg",
        ownerType: "trait",
        ownerId: "t",
        trigger: "beforeDamage",
        effects: [
          { type: "modifyDamage", scope: "outgoing", mode: "multiply", value: 2 },
          { type: "modifyDamage", scope: "incoming", mode: "multiply", value: 0.5 },
          { type: "setDamageReduction", percent: 50 },
          { type: "setHits", hits: 3 },
        ],
      },
    ]);
    expect((event.data.modifiers as Record<string, number>)).toEqual({ attackerMult: 2, defenderMult: 0.5, reduction: 50, hits: 3 });
  });

  it("no modifiers → baseline formula", () => {
    const event = run();
    expect((event.data.modifiers as Record<string, number>)).toEqual({ attackerMult: 1, defenderMult: 1, reduction: 0, hits: 1 });
  });

  it("100% reduction → zero damage", () => {
    const event = run([{ id: "guard", ownerType: "trait", ownerId: "t", trigger: "beforeDamage", effects: [{ type: "setDamageReduction", percent: 100 }] }]);
    expect(event.data.value).toBe(0);
  });

  it("hits multiply damage", () => {
    const base = run().data.value as number;
    const event = run([{ id: "combo", ownerType: "trait", ownerId: "t", trigger: "beforeDamage", effects: [{ type: "setHits", hits: 2 }] }]);
    expect(event.data.value).toBe(base * 2);
  });

  it("setHits scales with a target mark's stacks", () => {
    const runtime = new MechanismRuntime(
      new MechanismRegistry([
        { id: "multi", ownerType: "skill", ownerId: "sk-1", trigger: "beforeDamage", effects: [{ type: "setHits", target: "target", markId: "starfall-mark", base: 1, perStack: 1 }] },
      ]),
    );
    const st = battle();
    st.enemy.active.marks["starfall-mark"] = 4;
    const [event] = runtime.applyDamageCommands(st, miniBundle, [dealDamage]);
    expect((event.data.modifiers as Record<string, number>).hits).toBe(5);
  });

  it("outgoing multiply scales per-hit damage", () => {
    const base = run().data.value as number;
    const event = run([{ id: "brave", ownerType: "trait", ownerId: "t", trigger: "beforeDamage", effects: [{ type: "modifyDamage", scope: "outgoing", mode: "multiply", value: 2 }] }]);
    const value = event.data.value as number;
    expect(value).toBeGreaterThan(base);
    expect(value).toBeLessThanOrEqual(base * 2 + 2);
  });
});

describe("condition logic", () => {
  it("supports allOf / anyOf / not", () => {
    const registry = new MechanismRegistry([
      {
        id: "logic",
        ownerType: "trait",
        ownerId: "t",
        trigger: "actionDeclared",
        when: [
          { allOf: [{ path: "event.action.kind", op: "eq", value: "skill" }, { not: { path: "event.action.skillId", op: "eq", value: "sk-1" } }] },
          { anyOf: [{ path: "event.turn", op: "gte", value: 1 }, { path: "event.turn", op: "lt", value: 0 }] },
        ],
        effects: [{ type: "forceFirst" }],
      },
    ]);
    expect(registry.collect({ state, trigger: "actionDeclared", event: { action: { kind: "skill", skillId: "sk-2" }, turn: 3 } })).toHaveLength(1);
    expect(registry.collect({ state, trigger: "actionDeclared", event: { action: { kind: "skill", skillId: "sk-1" }, turn: 3 } })).toHaveLength(0);
  });
});

describe("chance gating", () => {
  function run(chance: number) {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })), { seed: 9 });
    runtime.applyStateCommands(battle, [command({ type: "modifyEnergy", target: "self", delta: 5, chance })]);
    return battle.player.active.energy;
  }
  it("chance 0 never, chance 1 always, deterministic in between", () => {
    expect(run(0)).toBe(0);
    expect(run(1)).toBe(5);
    expect(run(0.5)).toBe(run(0.5));
  });
});

describe("immunity", () => {
  function battle() {
    const b = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })),
      makeSide(makeActive("sp-fire", { hp: 100, maxHp: 100 })),
    );
    return b;
  }
  const bundle: DataBundle = {
    ...miniBundle,
    sprites: { ...miniBundle.sprites, "sp-fire": { id: "sp-fire", elements: ["Fire"], race: {}, skillList: [] } },
  };
  it("skips applying a status when the target element is immune", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = battle();
    runtime.applyStateCommands(st, [command({ type: "applyStatus", target: "target", statusId: "burn", layers: 6, immuneElements: ["Fire"] })], bundle);
    expect(st.enemy.active.statuses.burn).toBeUndefined();
  });
  it("applies the status to a non-immune target", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
    runtime.applyStateCommands(st, [command({ type: "applyStatus", target: "target", statusId: "burn", layers: 6, immuneElements: ["Fire"] })], bundle);
    expect(st.enemy.active.statuses.burn).toBe(6);
  });
});

describe("turnEnd status settlement (per side)", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    statuses: { burn: { id: "burn", name: "灼烧", maxStack: 10 } },
    mechanisms: [
      ...(miniBundle.mechanisms ?? []),
      {
        id: "status:burn",
        ownerType: "status",
        ownerId: "burn",
        trigger: "turnEnd",
        when: [{ path: "self.active.statuses.burn", op: "gte", value: 1 }],
        effects: [
          { type: "dealDamage", target: "self", category: "Passive", power: 0, basis: "maxHp", amount: 0.02 },
          { type: "settleStatus", target: "self", statusId: "burn", decayLayers: "half" },
        ],
      },
    ],
  };
  it("deals 2% maxHp and halves burn layers on the carrier", () => {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 1 },
    );
    battle.enemy.active.statuses.burn = 4;
    const result = sim.step(battle, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(result.state.enemy.active.hp).toBe(200 - 4);
    expect(result.state.enemy.active.statuses.burn).toBe(2);
  });
});

describe("counter (actionDeclared + forceFirst)", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    skills: { ...miniBundle.skills, "sk-shield": { id: "sk-shield", skillName: "护盾", element: "Fire", category: "Defense", actionType: "Defense", power: 0, cost: 0 } },
    mechanisms: [
      ...(miniBundle.mechanisms ?? []),
      {
        id: "skill:sk-shield",
        ownerType: "skill",
        ownerId: "sk-shield",
        trigger: "actionDeclared",
        when: [{ path: "event.opponentAction.actionType", op: "eq", value: "Attack" }],
        effects: [{ type: "forceFirst", target: "self" }],
      },
    ],
  };
  it("forces first when the opponent declares an attack", () => {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 3 },
    );
    battle.player.active.loadout = ["sk-shield"];
    battle.enemy.active.loadout = ["sk-1"];
    const result = sim.step(battle, { kind: "skill", skillId: "sk-shield" }, { kind: "skill", skillId: "sk-1" }, new Rng(3));
    expect(result.events.some((event) => event.type === "action-priority-changed")).toBe(true);
  });
});

describe("cooldown subsystem", () => {
  it("resolves dynamic skillIdFrom from the context", () => {
    const registry = new MechanismRegistry([
      {
        id: "lock",
        ownerType: "trait",
        ownerId: "sp-380-1",
        trigger: "actionDeclared",
        when: [{ path: "event.opponentAction.kind", op: "eq", value: "skill" }],
        effects: [{ type: "modifyCooldown", target: "opponent", skillIdFrom: "event.opponentAction.skillId", delta: 1 }],
      },
    ]);
    const commands = registry.collect({ state, trigger: "actionDeclared", event: { opponentAction: { kind: "skill", skillId: "sk-9" } }, actorSide: "player", targetSide: "enemy" });
    expect((commands[0].definition as { skillId?: string }).skillId).toBe("sk-9");
  });

  const bundle: DataBundle = {
    ...miniBundle,
    skills: { ...miniBundle.skills, "sk-cd": { id: "sk-cd", skillName: "冷却技", element: "Normal", category: "Physical", actionType: "Attack", power: 30, cost: 0, cooldown: 1 } },
  };

  it("does not tick a cooldown set this turn (net, not off-by-one)", () => {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 5 },
    );
    battle.player.active.loadout = ["sk-cd"];
    const result = sim.step(battle, { kind: "skill", skillId: "sk-cd" }, { kind: "energy" }, new Rng(5));
    expect(result.state.player.active.cooldowns?.["sk-cd"]).toBe(1);
  });

  it("freezes cooldown while benched and resumes on field", () => {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 }), { bench: [makeActive("sp-b", { hp: 200, maxHp: 200 })] }),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 5 },
    );
    battle.player.active.loadout = ["sk-cd"];
    let result = sim.step(battle, { kind: "skill", skillId: "sk-cd" }, { kind: "energy" }, new Rng(5));
    result = sim.step(result.state, { kind: "switch", benchId: "sp-b" }, { kind: "energy" }, new Rng(5));
    const benched = result.state.player.bench.find((sprite) => sprite.spriteId === "sp-a");
    expect(benched?.cooldowns?.["sk-cd"]).toBe(1);
  });
});

describe("starfall burst", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    skills: {
      ...miniBundle.skills,
      "sk-hit": { id: "sk-hit", skillName: "普攻", element: "Normal", category: "Physical", actionType: "Attack", power: 40, cost: 0 },
      "sk-psy": { id: "sk-psy", skillName: "幻技", element: "Psychic", category: "Magic", actionType: "Attack", power: 40, cost: 0 },
    },
    rules: { ...miniBundle.rules, starfall: { element: "Psychic", power: { quad: 1, linear: 24, constant: -24 } } },
    mechanisms: [
      ...(miniBundle.mechanisms ?? []),
      { id: "skill:sk-hit", ownerType: "skill", ownerId: "sk-hit", trigger: "beforeAction", when: [{ path: "event.action.skillId", op: "eq", value: "sk-hit" }], effects: [{ type: "dealDamage", target: "target", category: "Physical", power: 40, skillId: "sk-hit" }] },
      { id: "skill:sk-psy", ownerType: "skill", ownerId: "sk-psy", trigger: "beforeAction", when: [{ path: "event.action.skillId", op: "eq", value: "sk-psy" }], effects: [{ type: "dealDamage", target: "target", category: "Magic", power: 40, skillId: "sk-psy" }] },
    ],
  };

  function run(skillId: string, stacks: number) {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 400, maxHp: 400, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 400, maxHp: 400, energy: 5 })),
      { turn: 1, seed: 1 },
    );
    battle.player.active.loadout = [skillId];
    battle.enemy.active.marks["starfall-mark"] = stacks;
    return sim.step(battle, { kind: "skill", skillId }, { kind: "energy" }, new Rng(1));
  }

  it("a non-psychic hit detonates all stacks and consumes them", () => {
    const result = run("sk-hit", 5);
    const event = result.events.find((e) => e.type === "starfall");
    expect(event).toBeTruthy();
    expect(event?.data.starPower).toBe(121); // 5² + 24·5 − 24
    expect(result.state.enemy.active.marks["starfall-mark"]).toBeUndefined();
  });

  it("doubles as extra damage over the same hit without marks", () => {
    const base = run("sk-hit", 0).state.enemy.active.hp;
    const burst = run("sk-hit", 5).state.enemy.active.hp;
    expect(burst).toBeLessThan(base);
  });

  it("a psychic skill does not trigger starfall", () => {
    const result = run("sk-psy", 5);
    expect(result.events.some((e) => e.type === "starfall")).toBe(false);
    expect(result.state.enemy.active.marks["starfall-mark"]).toBe(5);
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
