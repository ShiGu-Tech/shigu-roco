/** 引擎测试共享 helper：条件满足器（把 `when` 反推为可满足的上下文值）。
 *
 *  供 compiler / program-collect 等回归测试复用：等价性测试要求条件**通过**（效果真正进入执行路径），
 *  由本工具对 pristine 夹具与事件做一次写入，随后两侧各取自己的克隆运行。
 *
 *  非 `*.test.*` 文件，vitest 不当测试收集，仅供 import。
 */

import { resolveRef } from "../mechanisms/conditions";
import type { Condition, MechanismDefinition } from "../mechanisms/types";
import type { Dict } from "../types";

export function setPath(root: Dict, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key] as Dict;
  }
  cur[keys[keys.length - 1]] = value;
}

/** 按 op 语义反推可满足值（want=false 则反着来，供 not / anyOf-violate 用）。 */
export function valueForOp(op: string, expected: unknown, want: boolean): unknown {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const sentinel = (v: unknown): unknown =>
    typeof v === "string" ? `${v}\u0000x` : typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : "\u0000";
  switch (op) {
    case "eq":
      return want ? expected : sentinel(expected);
    case "neq":
      return want ? sentinel(expected) : expected;
    case "gt":
      return num(expected) + (want ? 1 : -1);
    case "gte":
      return want ? expected : num(expected) - 1;
    case "lt":
      return num(expected) + (want ? -1 : 1);
    case "lte":
      return want ? expected : num(expected) + 1;
    case "in":
      return want && Array.isArray(expected) && expected.length ? expected[0] : "\u0000notin";
    case "has":
      return want ? { [String(expected)]: 1 } : {};
    case "contains":
      return want ? [expected] : [];
    default:
      return want ? expected : sentinel(expected);
  }
}

export function satisfy(cond: Condition, scope: Dict, want: boolean): void {
  if ("allOf" in cond) {
    if (want) cond.allOf.forEach((item) => satisfy(item, scope, true));
    else if (cond.allOf[0]) satisfy(cond.allOf[0], scope, false);
    return;
  }
  if ("anyOf" in cond) {
    if (want) {
      if (cond.anyOf[0]) satisfy(cond.anyOf[0], scope, true);
    } else cond.anyOf.forEach((item) => satisfy(item, scope, false));
    return;
  }
  if ("not" in cond) {
    satisfy(cond.not, scope, !want);
    return;
  }
  const expected = cond.valueFrom !== undefined ? resolveRef(scope, cond.valueFrom) : cond.value;
  setPath(scope, cond.path, valueForOp(cond.op, expected, want));
}

/** 合成上下文：对 pristine 夹具 + 事件写入可满足值（两侧随后各取自己的克隆运行）。 */
export function satisfyWhen(def: MechanismDefinition, base: Dict, event: Dict): void {
  if (!def.when?.length) return;
  const scope: Dict = {
    state: base,
    event,
    turn: (base as { turn?: number }).turn,
    self: (base as { player?: Dict }).player,
    actor: (base as { player?: Dict }).player,
    target: (base as { enemy?: Dict }).enemy,
    opponent: (base as { enemy?: Dict }).enemy,
  };
  def.when.forEach((cond) => satisfy(cond, scope, true));
}
