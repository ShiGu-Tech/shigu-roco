import { describe, expect, it } from "vitest";
import { effectiveCost } from "../cost";
import { ActionQueue, MechanismRegistry, MechanismRuntime } from "../mechanisms";
import type { EffectCommand, MechanismDefinition } from "../mechanisms";
import { Rng } from "../rng";
import { getBundle } from "../server";
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
    "sp-c": { id: "sp-c", elements: ["Normal"], race: { hp: 120, atk: 60, spatk: 60, defense: 60, spdef: 60, speed: 60 }, skillList: [] },
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

  it("setMark / scaleMark / transferMark / transformMark operate on mark layers", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));

    runtime.applyStateCommands(st, [command({ type: "setMark", target: "opponent", markId: "starfall-mark", layers: 7 })], twoMarks);
    expect(st.enemy.active.marks["starfall-mark"]).toBe(7);

    runtime.applyStateCommands(st, [command({ type: "scaleMark", target: "opponent", markId: "starfall-mark", delta: 2 })], twoMarks);
    expect(st.enemy.active.marks["starfall-mark"]).toBe(9);

    runtime.applyStateCommands(st, [command({ type: "transferMark", markId: "starfall-mark", amount: 4, from: "opponent", to: "self" })], twoMarks);
    expect(st.enemy.active.marks["starfall-mark"]).toBe(5);
    expect(st.player.active.marks["starfall-mark"]).toBe(4);

    runtime.applyStateCommands(st, [command({ type: "setMark", target: "player", markId: "attack-mark", layers: 3 })], twoMarks);
    runtime.applyStateCommands(st, [command({ type: "transformMark", target: "player", toMarkId: "starfall-mark" })], twoMarks);
    expect(st.player.active.marks["attack-mark"]).toBeUndefined();
    expect(st.player.active.marks["starfall-mark"]).toBe(7);
  });

  it("applyMark can take its layer count dynamically (layersFrom)", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
    st.enemy.active.marks["starfall-mark"] = 4;
    runtime.applyStateCommands(st, [command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layersFrom: "target.active.marks.starfall-mark" })], twoMarks);
    expect(st.enemy.active.marks["starfall-mark"]).toBe(8);
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

describe("memory domain (counters / skill mods)", () => {
  function st() {
    return makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
  }

  it("adds / sets / clears counters", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    runtime.applyStateCommands(battle, [command({ type: "addCounter", target: "self", key: "uses", delta: 2 })]);
    expect(battle.player.active.counters?.uses).toBe(2);
    runtime.applyStateCommands(battle, [command({ type: "setCounter", target: "self", key: "uses", valueFrom: "self.active.counters.uses" })]);
    expect(battle.player.active.counters?.uses).toBe(2);
    runtime.applyStateCommands(battle, [command({ type: "clearCounter", target: "self", key: "uses" })]);
    expect(battle.player.active.counters?.uses).toBeUndefined();
  });

  it("applyMark adds layers + counter-based dynamic layers; removeMark all", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.player.active.counters = { supernova: 1 };
    runtime.applyStateCommands(battle, [
      command({ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 1, layersFrom: "self.active.counters.supernova" }),
    ]);
    expect(battle.enemy.active.marks["starfall-mark"]).toBe(2);
    runtime.applyStateCommands(battle, [command({ type: "removeMark", target: "opponent" })]);
    expect(battle.enemy.active.marks["starfall-mark"]).toBeUndefined();
  });

  it("modifySkill records a persistent delta", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    runtime.applyStateCommands(battle, [command({ type: "modifySkill", target: "self", skillId: "sk-1", power: 45, cost: -1 })]);
    expect(battle.player.active.skillMods?.["sk-1"]).toEqual({ power: 45, cost: -1 });
  });
});

describe("dynamic values & consumeMark", () => {
  function st() {
    return makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
  }

  it("scales a dynamic path on applyMark", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.player.active.counters = { stacks: 3 };
    runtime.applyStateCommands(battle, [command({ type: "applyMark", target: "opponent", markId: "poison-mark", layersFrom: { path: "self.active.counters.stacks", scale: 2 } })]);
    expect(battle.enemy.active.marks["poison-mark"]).toBe(6);
  });

  it("sums a `*` wildcard path", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.player.active.debuffs = { atk: 2, speed: 3 };
    runtime.applyStateCommands(battle, [command({ type: "setCounter", target: "self", key: "debuffTotal", valueFrom: "self.active.debuffs.*" })]);
    expect(battle.player.active.counters?.debuffTotal).toBe(5);
  });

  it("consumeMark applies per-layer effects", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.enemy.active.marks = { "starfall-mark": 3, "thorn-mark": 2 };
    runtime.applyStateCommands(battle, [
      command({ type: "consumeMark", target: "opponent", effectsPerLayer: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }] }),
    ]);
    expect(battle.enemy.active.marks["starfall-mark"]).toBeUndefined();
    expect(battle.player.active.buffs.atk).toBeCloseTo(1);
  });

  it("powerFrom drives per-hit damage from state", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const base = st();
    const boosted = st();
    boosted.player.active.counters = { boost: 2 };
    const def = { type: "dealDamage" as const, target: "target", category: "Physical" as const, power: 450, powerFrom: { path: "self.active.counters.boost", scale: 50, offset: 450 }, skillId: "sk-1" };
    const [low] = runtime.applyDamageCommands(base, miniBundle, [command(def)]);
    const [high] = runtime.applyDamageCommands(boosted, miniBundle, [command(def)]);
    expect(high.data.value as number).toBeGreaterThan(low.data.value as number);
  });
});

describe("condition operators", () => {
  it("contains matches array membership for loadout guards", () => {
    const registry = new MechanismRegistry([
      { id: "own", ownerType: "skill", ownerId: "sk-2", trigger: "turnEnd", when: [{ path: "self.active.loadout", op: "contains", value: "sk-2" }], effects: [{ type: "modifyMagic", target: "self", delta: 1 }] },
    ]);
    const st = makeState(makeSide(makeActive("sp-a")), makeSide(makeActive("sp-b")));
    st.player.active.loadout = ["sk-2"];
    expect(registry.collect({ state: st, trigger: "turnEnd", actorSide: "player", targetSide: "enemy", event: {} }).length).toBe(1);
    expect(registry.collect({ state: st, trigger: "turnEnd", actorSide: "enemy", targetSide: "player", event: {} }).length).toBe(0);
  });
});

describe("entry inheritance (scheduleEntry)", () => {
  function st() {
    const bench = makeActive("sp-c", { hp: 100, maxHp: 100, energy: 0 });
    return makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100, energy: 2 }), { bench: [bench] }),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })),
    );
  }

  it("applies scheduled effects to the next entrant", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    runtime.applyStateCommands(battle, [command({ type: "scheduleEntry", target: "self", effects: [{ type: "modifyEnergy", target: "self", delta: 8 }] })]);
    expect(battle.player.pendingEntry?.length).toBe(1);
    const events = new Simulator(miniBundle).doSwitch(battle, "player", "sp-c");
    expect(battle.player.active.spriteId).toBe("sp-c");
    expect(battle.player.active.energy).toBe(13);
    expect(battle.player.pendingEntry).toBeUndefined();
    expect(events.some((event) => event.type === "energy-modified")).toBe(true);
  });

  it("inherits buffs from the outgoing sprite", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.player.active.buffs = { atk: 2 };
    runtime.applyStateCommands(battle, [command({ type: "scheduleEntry", target: "self", effects: [{ type: "inheritStat", polarity: "buff" }] })]);
    new Simulator(miniBundle).doSwitch(battle, "player", "sp-c");
    expect(battle.player.active.buffs.atk).toBe(2);
  });
});

describe("control domain (buffs / status / cost / switch)", () => {
  function st() {
    return makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
  }

  it("clearStat removes debuffs by polarity and honors layer count", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.player.active.debuffs = { atk: 3, speed: 2 };
    battle.player.active.buffs = { def: 1 };
    runtime.applyStateCommands(battle, [command({ type: "clearStat", target: "self", layers: 2, polarity: "debuff" })]);
    expect(battle.player.active.debuffs.atk).toBe(1);
    expect(battle.player.active.debuffs.speed).toBeUndefined();
    expect(battle.player.active.buffs.def).toBe(1);
  });

  it("setStatus / scaleStatus adjust layers", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    runtime.applyStateCommands(battle, [command({ type: "setStatus", target: "target", statusId: "burn", layers: 3 })]);
    expect(battle.enemy.active.statuses.burn).toBe(3);
    runtime.applyStateCommands(battle, [command({ type: "scaleStatus", target: "target", statusId: "burn", factor: 2 })]);
    expect(battle.enemy.active.statuses.burn).toBe(6);
  });

  it("modifySkillCost registers cost mods scoped by skill type", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.player.active.loadout = ["sk-1"];
    runtime.applyStateCommands(battle, [command({ type: "modifySkillCost", target: "self", scope: "attack", delta: 2 })], miniBundle);
    expect(effectiveCost(battle, miniBundle, "player", "sk-1")).toBe(2);
    runtime.applyStateCommands(battle, [command({ type: "modifySkillCost", target: "self", skillId: "sk-1", delta: -1 })], miniBundle);
    expect(effectiveCost(battle, miniBundle, "player", "sk-1")).toBe(1);
  });

  it("forceSwitch / escape / allowSwitch set side flags", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const battle = st();
    battle.enemy.switchLock = 2;
    runtime.applyStateCommands(battle, [command({ type: "forceSwitch", target: "opponent" })]);
    expect(battle.enemy.forcedSwitch).toBe(true);
    runtime.applyStateCommands(battle, [command({ type: "allowSwitch", target: "opponent" })]);
    expect(battle.enemy.switchLock).toBe(0);
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

  it("modifySkill power delta raises the skill's damage", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const st = battle();
    runtime.applyStateCommands(st, [command({ type: "modifySkill", target: "self", skillId: "sk-1", power: 60 })]);
    const [base] = new MechanismRuntime(new MechanismRegistry()).applyDamageCommands(battle(), miniBundle, [dealDamage]);
    const [buffed] = runtime.applyDamageCommands(st, miniBundle, [dealDamage]);
    expect(buffed.data.value as number).toBeGreaterThan(base.data.value as number);
  });

  it("setHits can read a counter via a context path", () => {
    const runtime = new MechanismRuntime(
      new MechanismRegistry([
        { id: "h", ownerType: "skill", ownerId: "sk-1", trigger: "beforeDamage", effects: [{ type: "setHits", target: "target", hitsFrom: "self.active.counters.extra" }] },
      ]),
    );
    const st = battle();
    st.player.active.counters = { extra: 3 };
    const [event] = runtime.applyDamageCommands(st, miniBundle, [dealDamage]);
    expect((event.data.modifiers as Record<string, number>).hits).toBe(3);
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

describe("react success (应对)", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    skills: {
      ...miniBundle.skills,
      "sk-react": {
        id: "sk-react", skillName: "护盾", element: "Fire", category: "Defense", actionType: "Defense", power: 0, cost: 0,
        reaction: "Attack",
      },
    },
    mechanisms: [
      ...(miniBundle.mechanisms ?? []),
      { id: "react", ownerType: "skill", ownerId: "sk-react", trigger: "actionResolved", when: [{ path: "event.reacted", op: "eq", value: true }], effects: [{ type: "modifyMagic", target: "self", delta: -1 }] },
    ],
  };

  it("records lastTurn.reacted and fires reacted-conditional effects", () => {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 7 },
    );
    battle.player.active.loadout = ["sk-react"];
    battle.enemy.active.loadout = ["sk-1"];
    const result = sim.step(battle, { kind: "skill", skillId: "sk-react" }, { kind: "skill", skillId: "sk-1" }, new Rng(7));
    expect(result.state.player.lastTurn?.reacted).toBe(true);
    expect(result.state.enemy.lastTurn?.reacted ?? false).toBe(false);
    expect(result.state.player.magic).toBeLessThan(5);
  });

  it("does not react when the opponent uses a non-matching action", () => {
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 8 },
    );
    battle.player.active.loadout = ["sk-react"];
    const result = sim.step(battle, { kind: "skill", skillId: "sk-react" }, { kind: "energy" }, new Rng(8));
    expect(result.state.player.lastTurn?.reacted ?? false).toBe(false);
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

describe("starfall burst (data-driven mark mechanism)", () => {
  // 「星陨引爆」不再在引擎里：完全由一条 mark 机制描述（含多项式威力 N²+24N−24）。
  const burst = (category: "Physical" | "Magic") => ({
    id: `mark:starfall-mark:${category.toLowerCase()}`,
    ownerType: "mark",
    ownerId: "starfall-mark",
    trigger: "onHit",
    when: [
      { path: "target.active.marks.starfall-mark", op: "gte", value: 1 },
      { path: "event.element", op: "neq", value: "Psychic" },
      { path: "event.damageType", op: "eq", value: category },
    ],
    effects: [
      {
        type: "consumeMark",
        target: "target",
        effectsOnConsume: [
          { type: "dealDamage", target: "target", category, element: "Psychic", power: 0, powerFrom: { path: "event.consumed", terms: [{ coef: 1, power: 2 }, { coef: 24, power: 1 }, { coef: -24, power: 0 }] } },
        ],
      },
    ],
  });
  const bundle: DataBundle = {
    ...miniBundle,
    skills: {
      ...miniBundle.skills,
      "sk-hit": { id: "sk-hit", skillName: "普攻", element: "Normal", category: "Physical", actionType: "Attack", power: 40, cost: 0 },
      "sk-psy": { id: "sk-psy", skillName: "幻技", element: "Psychic", category: "Magic", actionType: "Attack", power: 40, cost: 0 },
    },
    mechanisms: [
      ...(miniBundle.mechanisms ?? []),
      { id: "skill:sk-hit", ownerType: "skill", ownerId: "sk-hit", trigger: "beforeAction", when: [{ path: "event.action.skillId", op: "eq", value: "sk-hit" }], effects: [{ type: "dealDamage", target: "target", category: "Physical", power: 40, skillId: "sk-hit" }] },
      { id: "skill:sk-psy", ownerType: "skill", ownerId: "sk-psy", trigger: "beforeAction", when: [{ path: "event.action.skillId", op: "eq", value: "sk-psy" }], effects: [{ type: "dealDamage", target: "target", category: "Magic", power: 40, skillId: "sk-psy" }] },
      burst("Physical"),
      burst("Magic"),
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

  it("a non-psychic hit consumes all stacks via the mark mechanism", () => {
    const result = run("sk-hit", 5);
    const consumed = result.events.find((e) => e.type === "mark-consumed");
    expect(consumed?.data.total).toBe(5);
    expect(result.state.enemy.active.marks["starfall-mark"]).toBeUndefined();
  });

  it("adds extra damage over the same hit without marks", () => {
    const base = run("sk-hit", 0).state.enemy.active.hp;
    const burst = run("sk-hit", 5).state.enemy.active.hp;
    expect(burst).toBeLessThan(base);
  });

  it("a psychic skill does not trigger starfall", () => {
    const result = run("sk-psy", 5);
    expect(result.events.some((e) => e.type === "mark-consumed")).toBe(false);
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

describe("onEntry trigger (first entry)", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    mechanisms: [
      {
        id: "bell",
        ownerType: "trait",
        ownerId: "sp-a",
        trigger: "onEntry",
        when: [
          { path: "event.enteredSpriteId", op: "eq", value: "sp-a" },
          { path: "event.first", op: "eq", value: true },
        ],
        effects: [{ type: "dealDamage", target: "self", category: "Passive", power: 0, basis: "currentHp", amount: 0.5 }],
      },
    ],
  };

  function build(): BattleState {
    const b = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 }), { bench: [makeActive("sp-b", { hp: 200, maxHp: 200 })] }),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200 })),
      { turn: 1, seed: 7 },
    );
    b.player.active.loadout = ["sk-1"];
    b.enemy.active.loadout = ["sk-1"];
    return b;
  }

  it("loses half current HP on first entry at battle start", () => {
    const sim = new Simulator(bundle);
    const result = sim.step(build(), { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(result.state.player.active.hp).toBe(100);
    expect(result.state.player.active.entered).toBe(true);
    expect(result.events.some((e) => e.type === "damage" && e.data.value === 100)).toBe(true);
  });

  it("does not fire again on later entries", () => {
    const sim = new Simulator(bundle);
    const r1 = sim.step(build(), { kind: "energy" }, { kind: "energy" }, new Rng(1));
    const r2 = sim.step(r1.state, { kind: "switch", benchId: "sp-b" }, { kind: "energy" }, new Rng(1));
    expect(r2.state.player.active.spriteId).toBe("sp-b");
    const r3 = sim.step(r2.state, { kind: "switch", benchId: "sp-a" }, { kind: "energy" }, new Rng(1));
    expect(r3.state.player.active.spriteId).toBe("sp-a");
    expect(r3.state.player.active.hp).toBe(100);
  });

  it("ships batch-16 energy cost registrations", () => {
    const real = getBundle();
    const all = (real.mechanisms ?? []) as MechanismDefinition[];
    const find = (id: string) => all.find((m) => m.id === id);
    const firstEffect = (id: string) => (find(id)?.effects?.[0] ?? {}) as { type?: string; target?: string; duration?: string; turns?: number; dispellable?: boolean; scope?: string };
    expect(find("skill:sk-7020650")?.trigger).toBe("beforeAction");
    const noise = firstEffect("skill:sk-7020650");
    expect(noise).toMatchObject({ type: "modifySkillCost", target: "opponent", scope: "attack", duration: "turns", turns: 3, dispellable: true });
    expect(firstEffect("skill:sk-7050210:react")).toMatchObject({ type: "modifySkillCost", target: "self", duration: "permanent" });
    expect(find("trait:sp-8-1")?.trigger).toBe("skillUsed");
    expect(firstEffect("trait:sp-139-1")).toMatchObject({ target: "opponent", duration: "aura" });
    expect(firstEffect("trait:sp-159-1")).toMatchObject({ type: "modifySkillCost", duration: "nextAction" });
    expect(firstEffect("trait:sp-12-1")).toMatchObject({ scope: "defense" });
  });

  it("ships the real 铃兰晚钟 trait for sp-201-1 / sp-202-1", () => {
    const real = getBundle();
    const all = (real.mechanisms ?? []) as MechanismDefinition[];
    const mechs = all.filter((m) => m.id === "trait:sp-201-1" || m.id === "trait:sp-202-1");
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(m.trigger).toBe("onEntry");
      expect(JSON.stringify(m.effects)).toContain("currentHp");
    }
  });
});

describe("weather domain (element-filtered cost / damage / turn-end status)", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    skills: {
      ...miniBundle.skills,
      "sk-e": { id: "sk-e", skillName: "岩击", element: "Earth", category: "Physical", actionType: "Attack", power: 40, cost: 4 },
      "sk-n": { id: "sk-n", skillName: "拍击", element: "Normal", category: "Physical", actionType: "Attack", power: 40, cost: 4 },
      "sk-w": { id: "sk-w", skillName: "水枪", element: "Water", category: "Magic", actionType: "Attack", power: 40, cost: 0 },
    },
    statuses: { freeze: { id: "freeze", name: "冻结", maxStack: 10 } },
    weather: { rain: { id: "rain" }, sandstorm: { id: "sandstorm" }, blizzard: { id: "blizzard" }, thunder: { id: "thunder" } },
    mechanisms: [
      ...(miniBundle.mechanisms ?? []),
      { id: "skill:sk-w", ownerType: "skill", ownerId: "sk-w", trigger: "beforeAction", when: [{ path: "event.action.skillId", op: "eq", value: "sk-w" }], effects: [{ type: "dealDamage", target: "target", category: "Magic", power: 40, skillId: "sk-w" }] },
      {
        id: "weather:sandstorm",
        ownerType: "weather",
        ownerId: "sandstorm",
        trigger: "beforeAction",
        when: [{ path: "state.weather.id", op: "eq", value: "sandstorm" }],
        effects: [{ type: "modifySkillCost", target: "self", scope: "all", elements: ["Earth"], multiply: 0.5, mode: "set" }],
      },
      {
        id: "weather:rain",
        ownerType: "weather",
        ownerId: "rain",
        trigger: "beforeDamage",
        when: [
          { path: "state.weather.id", op: "eq", value: "rain" },
          { path: "event.element", op: "eq", value: "Water" },
        ],
        effects: [{ type: "modifyDamage", mode: "multiply", value: 1.75, scope: "outgoing" }],
      },
      {
        id: "weather:blizzard",
        ownerType: "weather",
        ownerId: "blizzard",
        trigger: "turnEnd",
        when: [{ path: "state.weather.id", op: "eq", value: "blizzard" }],
        effects: [{ type: "applyStatus", target: "self", statusId: "freeze", layers: 2, immuneElements: ["Ice"] }],
      },
    ],
  };

  it("filters cost mods by skill element", () => {
    const st = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })),
    );
    st.player.active.loadout = ["sk-e", "sk-n"];
    const runtime = new MechanismRuntime(new MechanismRegistry());
    runtime.applyStateCommands(
      st,
      [command({ type: "modifySkillCost", target: "self", scope: "all", elements: ["Earth"], multiply: 0.5, mode: "set" })],
      bundle,
    );
    expect(effectiveCost(st, bundle, "player", "sk-e")).toBe(2);
    expect(effectiveCost(st, bundle, "player", "sk-n")).toBe(4);
  });

  it("boosts water damage by ~75% in rain", () => {
    const sim = new Simulator(bundle);
    const run = (weather: BattleState["weather"]) => {
      const st = makeState(
        makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
        makeSide(makeActive("sp-b", { hp: 400, maxHp: 400, energy: 5 })),
        { turn: 1, seed: 3, weather },
      );
      st.player.active.loadout = ["sk-w"];
      return 400 - sim.step(st, { kind: "skill", skillId: "sk-w" }, { kind: "energy" }, new Rng(3)).state.enemy.active.hp;
    };
    const base = run(null);
    const rain = run({ id: "rain", turnsLeft: 3 });
    expect(rain).toBeGreaterThan(base);
    expect(rain).toBeGreaterThanOrEqual(Math.floor(base * 1.7));
  });

  it("applies 2 freeze to both sides at turn end under blizzard", () => {
    const sim = new Simulator(bundle);
    const st = makeState(
      makeSide(makeActive("sp-a", { hp: 200, maxHp: 200, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 200, maxHp: 200, energy: 5 })),
      { turn: 1, seed: 3, weather: { id: "blizzard", turnsLeft: 3 } },
    );
    const r = sim.step(st, { kind: "energy" }, { kind: "energy" }, new Rng(3));
    expect(r.state.player.active.statuses.freeze).toBe(2);
    expect(r.state.enemy.active.statuses.freeze).toBe(2);
  });
});

describe("cost mod model (floor / dispel / oncePerTurn / duration)", () => {
  const st = () => makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));

  it("floors to whole energy and clamps at 0", () => {
    const b = st();
    b.player.active.costMods = [
      { key: "half", source: "trait", scope: "skill", skillId: "sk-1", multiply: 0.5, duration: "permanent", dispellable: false, hidden: false },
      { key: "big", source: "skill", scope: "skill", skillId: "sk-1", delta: -9, duration: "permanent", dispellable: true, hidden: false },
    ];
    expect(effectiveCost(b, miniBundle, "player", "sk-1")).toBe(0);
    // 3 能耗 × 0.5 = 1.5 → floor 1
    b.player.active.costMods = [{ key: "half", source: "skill", scope: "skill", skillId: "sk-3", multiply: 0.5, duration: "permanent", dispellable: true, hidden: false }];
    b.player.active.skillMods = undefined;
    expect(effectiveCost(b, { ...miniBundle, skills: { ...miniBundle.skills, "sk-3": { id: "sk-3", element: "Earth", category: "Physical", actionType: "Attack", power: 40, cost: 3 } } }, "player", "sk-3")).toBe(1);
  });

  it("clearCostMod removes dispellable harmful entries only", () => {
    const runtime = new MechanismRuntime(new MechanismRegistry());
    const b = st();
    b.player.active.costMods = [
      { key: "debuff", source: "skill", scope: "all", delta: 2, duration: "permanent", dispellable: true, hidden: false },
      { key: "trait", source: "trait", scope: "all", delta: 2, duration: "permanent", dispellable: false, hidden: false },
    ];
    runtime.applyStateCommands(b, [command({ type: "clearCostMod", target: "self" })], miniBundle);
    expect(b.player.active.costMods?.map((m) => m.key)).toEqual(["trait"]);
  });

  it("oncePerTurn lets a mechanism fire only once per turn", () => {
    const registry = new MechanismRegistry([
      { id: "m", ownerType: "trait", ownerId: "t", trigger: "beforeAction", oncePerTurn: true, effects: [{ type: "modifyEnergy", target: "self", delta: 1 }] },
    ]);
    const b = st();
    b.onceFired = {};
    expect(registry.collect({ state: b, trigger: "beforeAction", actorSide: "player", event: {} })).toHaveLength(1);
    expect(registry.collect({ state: b, trigger: "beforeAction", actorSide: "player", event: {} })).toHaveLength(0);
    b.onceFired = {};
    expect(registry.collect({ state: b, trigger: "beforeAction", actorSide: "player", event: {} })).toHaveLength(1);
  });

  it("expires timed cost mods at turn end and charges the modified cost", () => {
    const bundle: DataBundle = {
      ...miniBundle,
      mechanisms: [
        {
          id: "timed-cost",
          ownerType: "trait",
          ownerId: "t",
          trigger: "beforeAction",
          when: [{ path: "event.action.skillId", op: "eq", value: "sk-1" }],
          effects: [{ type: "modifySkillCost", target: "self", skillId: "sk-1", delta: 3, duration: "turns", turns: 1 }],
        },
      ],
    };
    const sim = new Simulator(bundle);
    const battle = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100, energy: 5 })),
      { turn: 1, seed: 1 },
    );
    battle.player.active.loadout = ["sk-1"];
    const r = sim.step(battle, { kind: "skill", skillId: "sk-1" }, { kind: "energy" }, new Rng(1));
    expect(r.state.player.active.energy).toBe(2);
    expect(r.state.player.active.costMods?.some((m) => m.duration === "turns")).toBeFalsy();
  });
});

describe("batch-18 capabilities (loadout count / buff-debuff trigger / status source)", () => {
  const bundle: DataBundle = {
    ...miniBundle,
    skills: {
      ...miniBundle.skills,
      "sk-w1": { id: "sk-w1", skillName: "水枪", element: "Water", category: "Magic", actionType: "Attack", power: 40, cost: 1 },
      "sk-w2": { id: "sk-w2", skillName: "泡沫", element: "Water", category: "Magic", actionType: "Attack", power: 40, cost: 1 },
      "sk-e": { id: "sk-e", skillName: "岩击", element: "Earth", category: "Physical", actionType: "Attack", power: 60, cost: 4 },
      "sk-n": { id: "sk-n", skillName: "拍击", element: "Normal", category: "Physical", actionType: "Attack", power: 60, cost: 4 },
      "sk-cost": { id: "sk-cost", skillName: "试探", element: "Normal", category: "Physical", actionType: "Attack", power: 40, cost: 4 },
    },
    statuses: { freeze: { id: "freeze", name: "冻结", maxStack: 10 } },
  };

  it("DynamicValue.count scales a cost mod by matching loadout skills", () => {
    const b: DataBundle = {
      ...bundle,
      mechanisms: [
        {
          id: "waveblock",
          ownerType: "trait",
          ownerId: "sp-a",
          trigger: "onEntry",
          when: [
            { path: "event.enteredSpriteId", op: "eq", value: "sp-a" },
            { path: "event.first", op: "eq", value: true },
          ],
          effects: [
            { type: "modifySkillCost", target: "self", scope: "all", elements: ["Earth"], deltaFrom: { path: "self.active.loadout", count: { element: "Water" }, scale: -1 } },
          ],
        },
      ],
    };
    const sim = new Simulator(b);
    const st = makeState(
      makeSide(makeActive("sp-a", { hp: 100, maxHp: 100, energy: 5 })),
      makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })),
      { turn: 1, seed: 4 },
    );
    st.player.active.loadout = ["sk-w1", "sk-w2", "sk-e", "sk-n"];
    const r = sim.step(st, { kind: "energy" }, { kind: "energy" }, new Rng(4));
    // 2 个水系 → 地系 -2；普通系不受影响。
    expect(effectiveCost(r.state, b, "player", "sk-e")).toBe(2);
    expect(effectiveCost(r.state, b, "player", "sk-n")).toBe(4);
  });

  it("buffGained / debuffGained drive cost changes, gated oncePerTurn", () => {
    const b: DataBundle = {
      ...bundle,
      mechanisms: [
        {
          id: "prince-buff",
          ownerType: "trait",
          ownerId: "sp-a",
          trigger: "buffGained",
          when: [{ path: "self.active.spriteId", op: "eq", value: "sp-a" }],
          oncePerTurn: true,
          effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -1 }],
        },
        {
          id: "prince-debuff",
          ownerType: "trait",
          ownerId: "sp-a",
          trigger: "debuffGained",
          when: [{ path: "self.active.spriteId", op: "eq", value: "sp-a" }],
          oncePerTurn: true,
          effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 1 }],
        },
      ],
    };
    const runtime = new MechanismRuntime(new MechanismRegistry(b.mechanisms as MechanismDefinition[]));
    const st = makeState(makeSide(makeActive("sp-a", { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
    st.onceFired = {};
    st.player.active.loadout = ["sk-cost"];
    // 获得增益 → 能耗 -1，且本回合第二次不再叠加。
    runtime.applyStateCommands(st, [command({ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 })], b);
    runtime.applyStateCommands(st, [command({ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 })], b);
    expect(effectiveCost(st, b, "player", "sk-cost")).toBe(3);
    // 获得减益 → 能耗 +1（另一机制，独立每回合 1 次）。
    runtime.applyStateCommands(st, [command({ type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: -20 })], b);
    expect(effectiveCost(st, b, "player", "sk-cost")).toBe(4);
  });

  it("statusApplied carries the applier so on-status cost traits can match", () => {
    const b: DataBundle = {
      ...bundle,
      mechanisms: [
        {
          id: "hide",
          ownerType: "trait",
          ownerId: "sp-a",
          trigger: "statusApplied",
          when: [
            { path: "event.statusId", op: "eq", value: "freeze" },
            { path: "event.sourceSpriteId", op: "eq", value: "sp-a" },
          ],
          effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 1 }],
        },
      ],
    };
    const runtime = new MechanismRuntime(new MechanismRegistry(b.mechanisms as MechanismDefinition[]));
    const applyFreeze = (caster: "sp-a" | "sp-b") => {
      const st = makeState(makeSide(makeActive(caster, { hp: 100, maxHp: 100 })), makeSide(makeActive("sp-b", { hp: 100, maxHp: 100 })));
      st.enemy.active.loadout = ["sk-cost"];
      runtime.applyStateCommands(st, [command({ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 1 })], b);
      return st;
    };
    expect(effectiveCost(applyFreeze("sp-a"), b, "enemy", "sk-cost")).toBe(5);
    expect(effectiveCost(applyFreeze("sp-b"), b, "enemy", "sk-cost")).toBe(4);
  });

  it("ships batch-18 trait registrations (消波块 / 王子的诺言 / 捉迷藏)", () => {
    const real = getBundle();
    const all = (real.mechanisms ?? []) as MechanismDefinition[];
    const find = (id: string) => all.find((m) => m.id === id);
    expect(find("trait:sp-171-1")?.trigger).toBe("onEntry");
    const wave = (find("trait:sp-171-1")?.effects?.[0] ?? {}) as { type?: string; elements?: string[]; deltaFrom?: { count?: { element?: string }; scale?: number } };
    expect(wave.type).toBe("modifySkillCost");
    expect(wave.elements).toEqual(["Earth"]);
    expect(wave.deltaFrom?.count?.element).toBe("Water");
    expect(wave.deltaFrom?.scale).toBe(-1);
    expect(find("trait:sp-427-1")?.trigger).toBe("buffGained");
    expect(find("trait:sp-427-1")?.oncePerTurn).toBe(true);
    expect(find("trait:sp-142-1")?.trigger).toBe("statusApplied");
    expect((find("trait:sp-142-1")?.when ?? []).some((c) => "path" in c && c.path === "event.sourceSpriteId")).toBe(true);
  });
});
