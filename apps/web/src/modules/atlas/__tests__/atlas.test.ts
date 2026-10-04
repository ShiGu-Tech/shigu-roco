import { beforeEach, describe, expect, it } from "vitest";

import { TRIGGER_NAMES } from "@/modules/engine/mechanisms/vocabulary";

import { aggregateTrace, collectAtlasStep, flattenFirings } from "../collect";
import { ATLAS_STAGES, UNWIRED_TRIGGERS, skeletonTriggers } from "../lifecycle";
import { MAX_ATLAS_STEPS, clearAtlasTrace, readAtlasTrace, recordAtlasStep } from "../storage";
import type { AtlasStep, AtlasTrace } from "../types";

// ---------------------------------------------------------------- collect

describe("collectAtlasStep（事件流 → 轨迹步）", () => {
  it("按 trigger 归桶、保首现序、机制带次数、效果去重、无 trigger 事件跳过", () => {
    const step = collectAtlasStep({
      turn: 3,
      actions: [{ side: "player", kind: "skill", skillId: "sk-1", label: "技能 · 猛烈撞击" }],
      log: [
        { type: "raw", data: {} }, // 无 trigger → 跳过
        { type: "stat-modified", data: { trigger: "beforeAction", mechanismId: "skill:a", effectType: "modifyStat" } },
        { type: "damage", data: { trigger: "beforeDamage", mechanismId: "skill:a", effectType: "dealDamage" } },
        { type: "healed", data: { trigger: "beforeDamage", mechanismId: "skill:b", effectType: "heal" } },
        { type: "damage", data: { trigger: "beforeDamage", mechanismId: "skill:a", effectType: "dealDamage" } },
        { type: "x", data: { trigger: "beforeAction", mechanismId: "skill:b" } },
      ],
    });

    expect(step.turn).toBe(3);
    expect(step.actions[0].label).toBe("技能 · 猛烈撞击");
    expect(step.fired.map((b) => b.trigger)).toEqual(["beforeAction", "beforeDamage"]);

    const declared = step.fired[0];
    expect(declared.mechanisms).toEqual([
      { id: "skill:a", count: 1, effects: ["modifyStat"] },
      { id: "skill:b", count: 1, effects: [] },
    ]);

    const damage = step.fired[1];
    expect(damage.mechanisms[0]).toEqual({ id: "skill:a", count: 2, effects: ["dealDamage"] });
    expect(damage.mechanisms[1]).toEqual({ id: "skill:b", count: 1, effects: ["heal"] });
    expect(damage.effects).toEqual(["dealDamage", "heal"]);
  });

  it("同触发器多侧派发合并为一桶", () => {
    const step = collectAtlasStep({
      turn: 1,
      actions: [],
      log: [
        { type: "a", data: { trigger: "turnEnd", mechanismId: "trait:x", effectType: "modifyEnergy" } },
        { type: "b", data: { trigger: "turnEnd", mechanismId: "trait:y", effectType: "modifyEnergy" } },
      ],
    });
    expect(step.fired).toHaveLength(1);
    expect(step.fired[0].mechanisms.map((m) => m.id)).toEqual(["trait:x", "trait:y"]);
  });
});

describe("aggregateTrace（多步 → 点亮）", () => {
  it("跨步累计步数与机制次数，null 轨迹返回空", () => {
    expect(aggregateTrace(null).size).toBe(0);
    const mk = (mechanisms: { id: string; count: number }[]): AtlasStep => ({
      turn: 1,
      actions: [],
      fired: [{ trigger: "turnEnd", mechanisms: mechanisms.map((m) => ({ ...m, effects: ["modifyEnergy"] })), effects: ["modifyEnergy"] }],
    });
    const trace: AtlasTrace = {
      source: "board",
      updatedAt: 0,
      steps: [mk([{ id: "trait:x", count: 2 }]), mk([{ id: "trait:x", count: 1 }, { id: "trait:y", count: 4 }])],
    };
    const glow = aggregateTrace(trace).get("turnEnd");
    expect(glow?.steps).toBe(2);
    expect(glow?.mechanisms.get("trait:x")).toBe(3);
    expect(glow?.mechanisms.get("trait:y")).toBe(4);
    expect(glow?.effects.has("modifyEnergy")).toBe(true);
  });
});

describe("flattenFirings（回放序列）", () => {
  it("按步序展开触发器，跨步重复保留", () => {
    const steps: AtlasStep[] = [
      { turn: 1, actions: [], fired: [{ trigger: "turnStart", mechanisms: [], effects: [] }, { trigger: "beforeAction", mechanisms: [], effects: [] }] },
      { turn: 2, actions: [], fired: [{ trigger: "beforeAction", mechanisms: [], effects: [] }] },
    ];
    expect(flattenFirings(steps)).toEqual(["turnStart", "beforeAction", "beforeAction"]);
    expect(flattenFirings([])).toEqual([]);
  });
});

// ---------------------------------------------------------------- lifecycle

describe("lifecycle 骨架（漂移守卫）", () => {
  it("骨架触发器全部在词表内（含未接线）", () => {
    const known = new Set(TRIGGER_NAMES);
    for (const trigger of skeletonTriggers()) expect(known.has(trigger)).toBe(true);
  });

  it("骨架覆盖词表全部触发器（新增触发器必须挂进阶段或未接线）", () => {
    const covered = new Set(skeletonTriggers());
    for (const name of TRIGGER_NAMES) expect(covered.has(name)).toBe(true);
  });

  it("阶段 id 唯一、未接线列表与阶段不重叠", () => {
    const ids = ATLAS_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const wired = new Set(ATLAS_STAGES.flatMap((s) => s.triggers));
    for (const trigger of UNWIRED_TRIGGERS) expect(wired.has(trigger)).toBe(false);
  });
});

// ---------------------------------------------------------------- storage

/** node 环境自备假 window / localStorage（可注入配额异常）。 */
function installFakeWindow(options: { quotaFromStep?: number } = {}): { store: Map<string, string> } {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => {
      const parsed = JSON.parse(value) as AtlasTrace;
      if (options.quotaFromStep !== undefined && parsed.steps?.length > options.quotaFromStep) {
        throw new DOMException("quota exceeded");
      }
      store.set(key, value);
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage: fake };
  return { store };
}

describe("storage（限额与降级）", () => {
  beforeEach(() => {
    installFakeWindow();
    clearAtlasTrace();
  });

  it("同来源续写、超额头淘汰到 MAX_ATLAS_STEPS", () => {
    const mkStep = (turn: number): AtlasStep => ({ turn, actions: [], fired: [] });
    for (let i = 0; i < MAX_ATLAS_STEPS + 10; i++) recordAtlasStep("debug", mkStep(i));
    const trace = readAtlasTrace();
    expect(trace?.source).toBe("debug");
    expect(trace?.steps).toHaveLength(MAX_ATLAS_STEPS);
    expect(trace?.steps[0].turn).toBe(10); // 头部淘汰
    expect(trace?.steps[MAX_ATLAS_STEPS - 1].turn).toBe(MAX_ATLAS_STEPS + 9);
  });

  it("异源覆盖为新轨迹", () => {
    recordAtlasStep("debug", { turn: 1, actions: [], fired: [] });
    recordAtlasStep("board", { turn: 2, actions: [], fired: [] });
    const trace = readAtlasTrace();
    expect(trace?.source).toBe("board");
    expect(trace?.steps).toHaveLength(1);
    expect(trace?.steps[0].turn).toBe(2);
  });

  it("写入抛配额异常时降级保留最近 5 步", () => {
    installFakeWindow({ quotaFromStep: 5 });
    clearAtlasTrace();
    for (let i = 0; i < 20; i++) recordAtlasStep("debug", { turn: i, actions: [], fired: [] });
    expect(readAtlasTrace()?.steps).toHaveLength(5);
  });

  it("损坏 JSON 读出 null、清除后为 null", () => {
    recordAtlasStep("debug", { turn: 1, actions: [], fired: [] });
    expect(readAtlasTrace()).not.toBeNull();
    clearAtlasTrace();
    expect(readAtlasTrace()).toBeNull();
  });
});
