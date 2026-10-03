import { describe, expect, it } from "vitest";
import type { Condition, MechanismDefinition } from "@/modules/engine/mechanisms/types";

import {
  addCondition,
  addEffect,
  coerceFieldValue,
  getCondition,
  removeCondition,
  removeEffect,
  setConditionField,
  setEffectField,
  setOncePerTurn,
} from "../edit-ops";

function fixture(): MechanismDefinition {
  return {
    id: "skill:sk-test",
    ownerType: "skill",
    ownerId: "sk-test",
    trigger: "beforeAction",
    when: [
      { path: "event.action.skillId", op: "eq", value: "sk-test" },
      { allOf: [{ path: "self.active.hp", op: "lt", value: 100 }, { not: { path: "event.reacted", op: "eq", value: true } }] },
    ],
    effects: [{ type: "modifyEnergy", target: "self", delta: -3 }],
  };
}

describe("G3b 结构化编辑（edit-ops）", () => {
  it("改根条件字段：不可变 + 字面量编辑清掉 valueFrom", () => {
    const def = fixture();
    const next = setConditionField(def, { when: 0, leaf: [] }, "path", "event.skillId");
    expect((next.when as Condition[])[0]).toMatchObject({ path: "event.skillId" });
    expect((def.when as Condition[])[0]).not.toHaveProperty("path", "event.skillId"); // 原稿不动

    const dyn: MechanismDefinition = { ...def, when: [{ path: "self.active.hp", op: "gte", valueFrom: "self.active.maxHp" }] };
    const literal = setConditionField(dyn, { when: 0, leaf: [] }, "value", 50);
    const leaf = literal.when![0] as Record<string, unknown>;
    expect(leaf.value).toBe(50);
    expect(leaf.valueFrom).toBeUndefined(); // conditionsMatch 优先取 valueFrom，必须清掉
  });

  it("改嵌套条件（allOf 内、not 内）", () => {
    const def = fixture();
    const op = setConditionField(def, { when: 1, leaf: [0] }, "op", "gte");
    expect((op.when![1] as { allOf: Condition[] }).allOf[0]).toMatchObject({ op: "gte" });
    const value = setConditionField(def, { when: 1, leaf: [1, 0] }, "value", false);
    const not = (value.when![1] as { allOf: Condition[] }).allOf[1] as { not: Condition };
    expect(not.not).toMatchObject({ value: false });
    expect((def.when![1] as { allOf: Condition[] }).allOf[0]).toMatchObject({ op: "lt" }); // 不可变
  });

  it("非法操作抛错：未知算子 / 组合子当叶子 / 删 not 子节点", () => {
    const def = fixture();
    expect(() => setConditionField(def, { when: 0, leaf: [] }, "op", "warp" as never)).toThrow("未知条件算子");
    expect(() => setConditionField(def, { when: 1, leaf: [] }, "path", "x")).toThrow("组合子");
    expect(() => removeCondition(def, { when: 1, leaf: [1, 0] })).toThrow("取反");
    expect(() => getCondition(def, { when: 9, leaf: [] })).toThrow("条件不存在");
  });

  it("删条件：根删整条 when，嵌套删 allOf 项", () => {
    const def = fixture();
    const root = removeCondition(def, { when: 0, leaf: [] });
    expect(root.when).toHaveLength(1);
    const nested = removeCondition(def, { when: 1, leaf: [0] });
    expect((nested.when![1] as { allOf: Condition[] }).allOf).toHaveLength(1);
    expect((def.when![1] as { allOf: Condition[] }).allOf).toHaveLength(2); // 原稿不动
  });

  it("效果字段：覆盖既有 / 新增 key / undefined 删除", () => {
    const def = fixture();
    const bumped = setEffectField(def, 0, "delta", -9);
    expect((bumped.effects![0] as { delta: number }).delta).toBe(-9);
    const added = setEffectField(def, 0, "chance", 0.5);
    expect((added.effects![0] as { chance: number }).chance).toBe(0.5);
    const removed = setEffectField(added, 0, "chance", undefined);
    expect(removed.effects![0]).not.toHaveProperty("chance");
    expect(() => setEffectField(def, 7, "delta", 1)).toThrow("效果不存在");
  });

  it("增删效果 / 顶层增条件 / oncePerTurn 开关", () => {
    const def = fixture();
    const added = addEffect(def, { type: "applyStatus", target: "target", statusId: "burn" } as never);
    expect(added.effects).toHaveLength(2);
    const trimmed = removeEffect(added, 1);
    expect(trimmed.effects).toHaveLength(1);
    expect(() => removeEffect(def, 3)).toThrow("效果不存在");

    const withCond = addCondition(def, { path: "state.turn", op: "gte", value: 1 });
    expect(withCond.when).toHaveLength(3);
    expect(def.when).toHaveLength(2); // 原稿不动

    expect(setOncePerTurn(def, true).oncePerTurn).toBe(true);
    expect(setOncePerTurn({ ...def, oncePerTurn: true }, false).oncePerTurn).toBeUndefined();
    expect(def.oncePerTurn).toBeUndefined();
  });

  it("coerce：按原值类型优先，新增字段 JSON 探测", () => {
    expect(coerceFieldValue(30, "12")).toBe(12);
    expect(() => coerceFieldValue(30, "abc")).toThrow("需要数字");
    expect(coerceFieldValue("sk-1", "65")).toBe("65"); // 字符串不意外变数字
    expect(coerceFieldValue(true, "false")).toBe(false);
    expect(coerceFieldValue([1, 2], "[3]")).toEqual([3]);
    expect(() => coerceFieldValue({ a: 1}, "{bad")).toThrow("JSON");
    // 新增字段（原值 undefined）
    expect(coerceFieldValue(undefined, "65")).toBe(65);
    expect(coerceFieldValue(undefined, "true")).toBe(true);
    expect(coerceFieldValue(undefined, "[1,2]")).toEqual([1, 2]);
    expect(coerceFieldValue(undefined, "hello")).toBe("hello");
    expect(coerceFieldValue(undefined, "")).toBeUndefined();
  });
});
