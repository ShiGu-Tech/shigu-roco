import { describe, expect, it } from "vitest";
import { createRegistry, programHash, runProgram, validateProgram, type Program } from "../graph";
import { makeActive, makeSide, makeState } from "../state";
import type { DataBundle } from "../types";

const registry = createRegistry();

const sprite = { id: "sp", elements: ["Fire"], race: { hp: 200, atk: 100, spatk: 100, defense: 100, spdef: 100, speed: 100 } };
const bundle: DataBundle = {
  sprites: { sp: sprite },
  skills: {},
  statuses: {},
  marks: {},
  weather: {},
  elements: { elements: [], matrix: {}, values: {}, combine: {} },
  rules: { damageFormula: { balance: 1, stab: 1 }, combat: { damageReductionCap: 99 } },
  stats: {},
  assets: {},
  mechanisms: [],
  warnings: [],
  dataVersion: "t",
  dataUpdatedAt: "t",
};

/** on.turnStart → (self.hp < 100) ? dealDamage(target) 。 */
const program: Program = {
  programVersion: "1.0.0",
  nodes: [
    { id: "ev", type: "on.turnStart" },
    { id: "hp", type: "read.path", params: { path: "self.active.hp" } },
    { id: "lim", type: "read.literal", params: { value: 100 } },
    { id: "cmp", type: "cmp.lt" },
    { id: "branch", type: "flow.branch" },
    { id: "who", type: "query.side", params: { from: "target" } },
    { id: "pw", type: "read.literal", params: { value: 50 } },
    { id: "hit", type: "write.dealDamage", params: { category: "Physical" } },
  ],
  edges: [
    { from: { node: "ev", port: "out" }, to: { node: "branch", port: "in" }, kind: "control" },
    { from: { node: "hp", port: "value" }, to: { node: "cmp", port: "a" }, kind: "data" },
    { from: { node: "lim", port: "value" }, to: { node: "cmp", port: "b" }, kind: "data" },
    { from: { node: "cmp", port: "value" }, to: { node: "branch", port: "cond" }, kind: "data" },
    { from: { node: "branch", port: "then" }, to: { node: "hit", port: "in" }, kind: "control" },
    { from: { node: "who", port: "side" }, to: { node: "hit", port: "target" }, kind: "data" },
    { from: { node: "pw", port: "value" }, to: { node: "hit", port: "power" }, kind: "data" },
  ],
  entries: ["ev"],
};

function battle(playerHp: number) {
  return makeState(makeSide(makeActive("sp", { hp: playerHp, maxHp: 200, energy: 5 })), makeSide(makeActive("sp", { hp: 200, maxHp: 200, energy: 5 })), { turn: 3 });
}

describe("engine graph interpreter (G0)", () => {
  it("walks control + data edges and records a per-node trace", () => {
    const { state, trace } = runProgram({ program, registry, bundle, state: battle(80), entry: "ev", event: { actorSide: "player" } });
    const types = trace.map((t) => t.type);
    expect(types).toContain("on.turnStart");
    expect(types).toContain("cmp.lt");
    expect(types).toContain("flow.branch");
    expect(types).toContain("write.dealDamage");
    expect(trace.map((t) => t.seq)).toEqual([...trace.map((t) => t.seq)].sort((a, b) => a - b));
    const hit = trace.find((t) => t.node === "hit");
    expect(hit?.mutations?.[0].path).toBe("enemy.active.hp");
    expect(state.enemy.active.hp).toBeLessThan(200);
  });

  it("takes the else path when the condition is false", () => {
    const { state, trace } = runProgram({ program, registry, bundle, state: battle(150), entry: "ev", event: { actorSide: "player" } });
    expect(trace.some((t) => t.node === "hit")).toBe(false);
    expect(state.enemy.active.hp).toBe(200);
  });

  it("is deterministic for a given seed (rng nodes)", () => {
    const rngProgram: Program = {
      programVersion: "1",
      nodes: [
        { id: "ev", type: "on.turnStart" },
        { id: "roll", type: "rng.int", params: { max: 100 } },
        { id: "st", type: "write.modifyStat", params: { stat: "atk" } },
      ],
      edges: [
        { from: { node: "ev", port: "out" }, to: { node: "st", port: "in" }, kind: "control" },
        { from: { node: "roll", port: "value" }, to: { node: "st", port: "value" }, kind: "data" },
      ],
      entries: ["ev"],
    };
    const a = runProgram({ program: rngProgram, registry, bundle, state: battle(150), entry: "ev", seed: 7 });
    const b = runProgram({ program: rngProgram, registry, bundle, state: battle(150), entry: "ev", seed: 7 });
    expect(a.state.player.active.buffs.atk).toBe(b.state.player.active.buffs.atk);
  });

  it("validates unknown node types and missing required params", () => {
    const bad: Program = { programVersion: "1", nodes: [{ id: "x", type: "nope" }, { id: "d", type: "write.applyStatus" }], edges: [], entries: ["x"] };
    const issues = validateProgram(bad, registry);
    expect(issues.some((i) => i.message.includes("未知节点类型"))).toBe(true);
    expect(issues.some((i) => i.message.includes("缺少必填参数: statusId"))).toBe(true);
  });

  it("reuses effect semantics through write.* nodes", () => {
    const p: Program = {
      programVersion: "1",
      nodes: [
        { id: "ev", type: "on.turnStart" },
        { id: "who", type: "query.side", params: { from: "target" } },
        { id: "n", type: "read.literal", params: { value: 2 } },
        { id: "st", type: "write.applyStatus", params: { statusId: "burn" } },
      ],
      edges: [
        { from: { node: "ev", port: "out" }, to: { node: "st", port: "in" }, kind: "control" },
        { from: { node: "who", port: "side" }, to: { node: "st", port: "target" }, kind: "data" },
        { from: { node: "n", port: "value" }, to: { node: "st", port: "layers" }, kind: "data" },
      ],
      entries: ["ev"],
    };
    const { state } = runProgram({ program: p, registry, bundle, state: battle(150), entry: "ev", event: { actorSide: "player" } });
    expect(state.enemy.active.statuses.burn).toBe(2);
  });

  it("exposes resources such as the type matrix", () => {
    const withMatrix: DataBundle = { ...bundle, elements: { elements: [], matrix: { Fire: { Grass: 2 } }, values: { resisted: 0.5 }, combine: {} } };
    const p: Program = {
      programVersion: "1",
      nodes: [
        { id: "ev", type: "on.turnStart" },
        { id: "el", type: "resource.elements" },
        { id: "k", type: "read.countKeys" },
        { id: "st", type: "write.modifyStat", params: { stat: "atk" } },
      ],
      edges: [
        { from: { node: "ev", port: "out" }, to: { node: "st", port: "in" }, kind: "control" },
        { from: { node: "el", port: "matrix" }, to: { node: "k", port: "object" }, kind: "data" },
        { from: { node: "k", port: "value" }, to: { node: "st", port: "value" }, kind: "data" },
      ],
      entries: ["ev"],
    };
    const { state, trace } = runProgram({ program: p, registry, bundle: withMatrix, state: battle(150), entry: "ev" });
    expect(trace.some((t) => t.node === "el")).toBe(true);
    expect(state.player.active.buffs.atk).toBe(1);
  });

  it("produces a stable program hash", () => {
    const h = programHash(program);
    expect(h).toBe(programHash({ ...program, hash: "ignored" }));
    expect(h).not.toBe(programHash({ ...program, entries: ["ev", "ev"] }));
  });
});
