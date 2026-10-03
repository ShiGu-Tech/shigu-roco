import { describe, expect, it } from "vitest";

import type { MechanismDefinition } from "@/modules/engine/mechanisms/types";
import { toMechanismGraph } from "../dsl-graph";

const base: MechanismDefinition = {
  id: "skill:sk-x",
  ownerType: "skill",
  ownerId: "sk-x",
  trigger: "beforeAction",
  effects: [],
};

describe("workbench dsl-graph 投影", () => {
  it("无条件机制：trigger → 效果节点，列位按深度", () => {
    const graph = toMechanismGraph({
      ...base,
      effects: [{ type: "dealDamage", target: "target", category: "Physical", power: 65 }],
    });
    expect(graph.nodes.map((n) => n.id)).toEqual(["n:trigger", "n:eff.0"]);
    const trigger = graph.nodes[0];
    const effect = graph.nodes[1];
    expect(trigger.kind).toBe("trigger");
    expect(trigger.title).toBe("行动执行前");
    expect(effect.kind).toBe("effect");
    expect(effect.title).toBe("造成伤害");
    expect(effect.domain).toBe("damage");
    expect(effect.position.x).toBe(240);
    expect(graph.edges).toEqual([{ id: "n:trigger->n:eff.0", from: "n:trigger", to: "n:eff.0", label: "效果" }]);
  });

  it("条件树：叶子 + allOf 组合节点，边串联", () => {
    const graph = toMechanismGraph({
      ...base,
      when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: "sk-x" }, { path: "self.active.hp", op: "lt", value: 50 }] }],
      effects: [{ type: "setHits", hits: 5 }],
    });
    const kinds = Object.fromEntries(graph.nodes.map((n) => [n.id, n.kind]));
    expect(kinds).toMatchObject({ "n:trigger": "trigger", "n:when.0": "combinator", "n:when.0.0": "condition", "n:when.0.1": "condition", "n:eff.0": "effect" });
    const leaf = graph.nodes.find((n) => n.id === "n:when.0.1");
    expect(leaf?.title).toBe("self.active.hp 小于 50");
    expect(graph.edges.map((e) => e.id)).toContain("n:when.0->n:when.0.1");
    expect(graph.edges.map((e) => e.id)).toContain("n:when.0->n:eff.0");
  });

  it("嵌套效果展开为子节点，参数标记子效果 id", () => {
    const graph = toMechanismGraph({
      ...base,
      effects: [
        {
          type: "consumeMark",
          markId: "starfall-mark",
          effectsOnConsume: [{ type: "dealDamage", category: "Passive", power: 100, basis: "stack" }],
        },
      ],
    });
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("n:eff.0");
    expect(ids).toContain("n:eff.0.effectsOnConsume.0");
    const parent = graph.nodes.find((n) => n.id === "n:eff.0");
    const nestedParam = parent?.params.find((p) => p.key === "effectsOnConsume");
    expect(nestedParam?.children).toEqual(["n:eff.0.effectsOnConsume.0"]);
    expect(nestedParam?.label).toBe("消耗后效果");
    const child = graph.nodes.find((n) => n.id === "n:eff.0.effectsOnConsume.0");
    expect(child?.title).toBe("造成伤害");
    expect((child?.position.x ?? 0) > (parent?.position.x ?? 0)).toBe(true);
  });

  it("动态取值参数标记 dynamic 徽章", () => {
    const graph = toMechanismGraph({
      ...base,
      effects: [{ type: "dealDamage", category: "Magic", power: 0, powerFrom: { path: "self.active.marks.starfall-mark", terms: [{ coef: 1, power: 2 }, { coef: 24, power: 1 }, { coef: -24, power: 0 }] } }],
    });
    const param = graph.nodes[1].params.find((p) => p.key === "powerFrom");
    expect(param?.dynamic).toBe(true);
    expect(param?.display).toContain("多项式(3项)");
  });

  it("概率与 unsupported 保留展示", () => {
    const graph = toMechanismGraph({
      ...base,
      effects: [
        { type: "heal", amount: 10, chance: 0.5 },
        { type: "unsupported", effectType: "诡异效果", reason: "待校准" },
      ],
    });
    const heal = graph.nodes.find((n) => n.id === "n:eff.0");
    expect(heal?.params.find((p) => p.key === "chance")?.value).toBe(0.5);
    const unsupported = graph.nodes.find((n) => n.id === "n:eff.1");
    expect(unsupported?.title).toBe("未支持效果");
    expect(unsupported?.domain).toBe("other");
    expect(graph.payloads["n:eff.1"]).toMatchObject({ effectType: "诡异效果" });
  });

  it("scheduleEntry 嵌套 + 顶层 when 串联到效果", () => {
    const graph = toMechanismGraph({
      ...base,
      trigger: "onEntry",
      when: [{ path: "event.first", op: "eq", value: true }],
      effects: [{ type: "scheduleEntry", effects: [{ type: "inheritStat", polarity: "buff" }] }],
    });
    expect(graph.nodes.find((n) => n.id === "n:trigger")?.title).toBe("入场");
    expect(graph.nodes.map((n) => n.id)).toEqual(["n:trigger", "n:when.0", "n:eff.0", "n:eff.0.effects.0"]);
    expect(graph.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      "n:trigger->n:when.0",
      "n:when.0->n:eff.0",
      "n:eff.0->n:eff.0.effects.0",
    ]);
    expect(graph.nodes.find((n) => n.id === "n:eff.0.effects.0")?.title).toBe("入场继承强化");
  });
});
