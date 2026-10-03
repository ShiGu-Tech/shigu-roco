/** G3b 结构化编辑操作：`MechanismDefinition` 草稿的不可变编辑原语（工作台编辑层）。
 *
 * 编辑模型：**DSL 草稿为源、程序图为面**——在画布上点程序节点（`source` 定位到 `when[i]` 字段 /
 * `effects[j]`），对草稿做结构化修改后重新 `compileMechanism` + `validateProgram`，写回的是
 * `data/mechanisms.json`（现行事实源；`data/program.json` 事实源切换属 G2b/G4）。
 *
 * v1 边界：只改既有字段 + 增删条件 / 效果 + 开关 oncePerTurn；不做自由连线（拓扑由编译器决定）、
 * 不改 trigger、嵌套效果（scheduleEntry.effects 等）整段透传不递归编辑。
 *
 * 纯函数（原稿不可变）、抛 `Error` 表达非法操作，可单测。
 */

import type { Condition, EffectDefinition, MechanismDefinition } from "@/modules/engine/mechanisms/types";
import { CONDITION_OP_LABELS } from "@/modules/engine/mechanisms/vocabulary";

/** 条件定位：`when[when]` 内、沿子索引走到 `leaf` 的条件节点。 */
export interface ConditionRef {
  when: number;
  leaf: number[];
}

export type ConditionField = "path" | "op" | "value" | "valueFrom";

type LeafCondition = Extract<Condition, { path: string }>;

function isCombinator(cond: Condition): cond is { allOf: Condition[] } | { anyOf: Condition[] } | { not: Condition } {
  return "allOf" in cond || "anyOf" in cond || "not" in cond;
}

function where(ref: ConditionRef): string {
  return `when[${ref.when}]${ref.leaf.length ? `.${ref.leaf.join(".")}` : ""}`;
}

/** 读取：沿子索引走到目标条件（允许走到 not 的子节点——读取合法，删除不合法）。 */
function walkTo(conditions: Condition[], ref: ConditionRef): Condition {
  const root = conditions[ref.when];
  if (!root) throw new Error(`条件不存在: when[${ref.when}]`);
  let cursor = root;
  for (const index of ref.leaf) {
    const next: Condition | undefined =
      "allOf" in cursor ? cursor.allOf[index] : "anyOf" in cursor ? cursor.anyOf[index] : "not" in cursor ? (index === 0 ? cursor.not : undefined) : undefined;
    if (!next) throw new Error(`条件路径不存在: ${where(ref)}`);
    cursor = next;
  }
  return cursor;
}

/** 不可变替换：`path` 指向的条件节点经 `fn` 变换后原路装回（新对象链）。 */
function replaceAt(cond: Condition, path: number[], fn: (node: Condition) => Condition): Condition {
  if (path.length === 0) return fn(cond);
  const [head, ...rest] = path;
  if ("allOf" in cond) {
    const list = [...cond.allOf];
    if (!list[head]) throw new Error("条件路径越界");
    list[head] = replaceAt(list[head], rest, fn);
    return { ...cond, allOf: list };
  }
  if ("anyOf" in cond) {
    const list = [...cond.anyOf];
    if (!list[head]) throw new Error("条件路径越界");
    list[head] = replaceAt(list[head], rest, fn);
    return { ...cond, anyOf: list };
  }
  if ("not" in cond) {
    if (head !== 0) throw new Error("取反只有一个子条件");
    return { ...cond, not: replaceAt(cond.not, rest, fn) };
  }
  throw new Error("条件路径越界：已到叶子仍有多余索引");
}

/** 不可变删除：`path` 指向的子条件从其 allOf/anyOf 父数组移除（not 子节点不可单删）。 */
function removeAt(cond: Condition, path: number[]): Condition {
  if (path.length === 1) {
    const head = path[0];
    if ("allOf" in cond) return { ...cond, allOf: cond.allOf.filter((_, index) => index !== head) };
    if ("anyOf" in cond) return { ...cond, anyOf: cond.anyOf.filter((_, index) => index !== head) };
    if ("not" in cond) throw new Error("不能直接删除取反的子条件，请删除整个取反");
    throw new Error("条件路径越界：叶子没有子条件");
  }
  const [head, ...rest] = path;
  if ("allOf" in cond) {
    const list = [...cond.allOf];
    if (!list[head]) throw new Error("条件路径越界");
    list[head] = removeAt(list[head], rest);
    return { ...cond, allOf: list };
  }
  if ("anyOf" in cond) {
    const list = [...cond.anyOf];
    if (!list[head]) throw new Error("条件路径越界");
    list[head] = removeAt(list[head], rest);
    return { ...cond, anyOf: list };
  }
  if ("not" in cond) {
    if (head !== 0) throw new Error("取反只有一个子条件");
    return { ...cond, not: removeAt(cond.not, rest) };
  }
  throw new Error("条件路径越界：已到叶子仍有多余索引");
}

/** 读取 ref 指向的条件（含组合子），供详情面板渲染完整表单。 */
export function getCondition(def: MechanismDefinition, ref: ConditionRef): Condition {
  return walkTo(def.when ?? [], ref);
}

/** 改条件叶子字段（path / op / value / valueFrom）。目标必须是叶子（组合子不可直接改值）。 */
export function setConditionField(def: MechanismDefinition, ref: ConditionRef, field: ConditionField, value: unknown): MechanismDefinition {
  if (field === "op" && (typeof value !== "string" || !(value in CONDITION_OP_LABELS))) {
    throw new Error(`未知条件算子: ${String(value)}`);
  }
  const conditions = [...(def.when ?? [])];
  if (ref.when >= conditions.length) throw new Error(`条件不存在: when[${ref.when}]`);
  conditions[ref.when] = replaceAt(conditions[ref.when], ref.leaf, (node) => {
    if (isCombinator(node)) throw new Error("该节点是组合子，请选择它下面的叶子条件");
    const leaf: LeafCondition = { ...node };
    if (field === "path") leaf.path = String(value);
    if (field === "op") leaf.op = value as LeafCondition["op"];
    if (field === "value") {
      leaf.value = value;
      // 字面量编辑生效：清掉会被 conditionsMatch 优先取用的动态引用。
      delete leaf.valueFrom;
    }
    if (field === "valueFrom") (leaf as { valueFrom?: unknown }).valueFrom = value;
    return leaf;
  });
  return { ...def, when: conditions };
}

/** 顶层增一条条件（初始条件由调用方决定）。 */
export function addCondition(def: MechanismDefinition, condition: Condition): MechanismDefinition {
  return { ...def, when: [...(def.when ?? []), condition] };
}

/** 删条件：根 → 整条 `when[i]`；allOf/anyOf 内的叶子 → 从数组移除。 */
export function removeCondition(def: MechanismDefinition, ref: ConditionRef): MechanismDefinition {
  const conditions = [...(def.when ?? [])];
  if (!conditions[ref.when]) throw new Error(`条件不存在: when[${ref.when}]`);
  if (ref.leaf.length === 0) {
    conditions.splice(ref.when, 1);
    return { ...def, when: conditions };
  }
  conditions[ref.when] = removeAt(conditions[ref.when], ref.leaf);
  return { ...def, when: conditions };
}

/** 改效果字段（key 已存在则覆盖；不存在则新增，供填必填参数）。value 应为已按类型强转的值；`undefined` = 删除该字段。 */
export function setEffectField(def: MechanismDefinition, effectIndex: number, key: string, value: unknown): MechanismDefinition {
  const effects = [...(def.effects ?? [])];
  const current = effects[effectIndex];
  if (!current) throw new Error(`效果不存在: effects[${effectIndex}]`);
  const next = { ...current } as unknown as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  effects[effectIndex] = next as unknown as EffectDefinition;
  return { ...def, effects };
}

export function addEffect(def: MechanismDefinition, effect: EffectDefinition): MechanismDefinition {
  return { ...def, effects: [...(def.effects ?? []), effect] };
}

export function removeEffect(def: MechanismDefinition, effectIndex: number): MechanismDefinition {
  const effects = [...(def.effects ?? [])];
  if (!effects[effectIndex]) throw new Error(`效果不存在: effects[${effectIndex}]`);
  effects.splice(effectIndex, 1);
  return { ...def, effects };
}

export function setOncePerTurn(def: MechanismDefinition, value: boolean): MechanismDefinition {
  return { ...def, oncePerTurn: value || undefined };
}

/** 表单文本 → 字段值：已存在的字段按原值类型强转；新增字段用 JSON 探测（数字 / 布尔 / 数组 / 对象）。 */
export function coerceFieldValue(original: unknown, raw: string): unknown {
  const text = raw.trim();
  if (original !== undefined && typeof original !== "object") {
    if (typeof original === "number") {
      if (text === "") return undefined;
      const parsed = Number(text);
      if (Number.isNaN(parsed)) throw new Error(`需要数字: ${text}`);
      return parsed;
    }
    if (typeof original === "boolean") return text === "true";
    return raw === "" ? undefined : raw; // 字符串保持字符串，不因 "65" 意外变数字
  }
  if (typeof original === "object" && original !== null) {
    if (text === "") return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`需要 JSON（数组 / 对象）: ${text}`);
    }
  }
  // 新增字段：看起来像 JSON / 数字 / 布尔就解析，否则保留字符串。
  if (text === "") return undefined;
  if (text.startsWith("[") || text.startsWith("{") || /^-?\d+(\.\d+)?$/.test(text) || text === "true" || text === "false") {
    try {
      return JSON.parse(text);
    } catch {
      return raw;
    }
  }
  return raw;
}
