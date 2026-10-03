import type { Side } from "../types";
import { toNum } from "../types";
import type { Condition, DynamicRef, MechanismContext } from "./types";

function readPath(root: unknown, path: string): unknown {
  const keys = path.split(".");
  // 末尾 `*` = 合计该对象的全部数值（如 `self.active.debuffs.*` 求减益总层数）。
  if (keys[keys.length - 1] === "*") {
    const container = readPath(root, keys.slice(0, -1).join("."));
    if (container && typeof container === "object" && !Array.isArray(container)) {
      return Object.values(container as Record<string, unknown>).reduce<number>((sum, value) => sum + (Number(value) || 0), 0);
    }
    return 0;
  }
  return keys.reduce<unknown>((value, key) => {
    if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

function sideState(context: MechanismContext, side: Side | undefined): unknown {
  if (!side) return undefined;
  return side === "player" ? context.state.player : context.state.enemy;
}

/** 条件作用域：self/actor 指触发方，target/opponent 指目标方，event 为事件负载。
 *  独立函数：一次 collect 批内建一次、全批复用（叶求值 / 门控 / conditionsMatch 共享同一份）。 */
export function conditionScope(context: MechanismContext): unknown {
  return {
    ...context,
    event: context.event,
    self: sideState(context, context.actorSide),
    actor: sideState(context, context.actorSide),
    target: sideState(context, context.targetSide),
    opponent: sideState(context, context.targetSide),
  };
}

/** 从上下文取值（供 effect 的动态引用，如 skillIdFrom）。 */
export function resolveContextPath(context: MechanismContext, path: string): unknown {
  return readPath(conditionScope(context), path);
}

/** 解析动态引用（字符串 = 点路径；对象 = 路径 + 系数 / 偏移 / 多项式）。条件里不含 bundle，故不支持 `count`。
 *  导出供执行图 `read.ref` 节点复用——条件子图与 `conditionsMatch` 共用同一求值，零语义漂移。 */
export function resolveRef(root: unknown, ref: DynamicRef): unknown {
  if (typeof ref === "string") return readPath(root, ref);
  const raw = toNum(readPath(root, ref.path), 0);
  if (ref.terms) return ref.terms.reduce((sum, term) => sum + term.coef * Math.pow(raw, term.power), 0) + (ref.offset ?? 0);
  return raw * (ref.scale ?? 1) + (ref.offset ?? 0);
}

/** 对**预建作用域**求值单条条件——门控（`gatePasses`）与 `conditionsMatch` 共用同一实现，零语义漂移。 */
export function matchCondition(scope: unknown, condition: Condition): boolean {
  if ("allOf" in condition) return condition.allOf.every((item) => matchCondition(scope, item));
  if ("anyOf" in condition) return condition.anyOf.some((item) => matchCondition(scope, item));
  if ("not" in condition) return !matchCondition(scope, condition.not);

  const actual = readPath(scope, condition.path);
  const expected = condition.valueFrom !== undefined ? resolveRef(scope, condition.valueFrom) : condition.value;
  switch (condition.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "contains":
      return Array.isArray(actual) && actual.includes(expected);
    case "has":
      return Boolean(
        actual &&
          typeof actual === "object" &&
          (typeof expected === "string" || typeof expected === "number" || typeof expected === "symbol") &&
          expected in actual,
      );
  }
}

/** 对预建作用域求值完整条件组（顶层合取）。 */
export function conditionsMatchOn(scope: unknown, conditions: Condition[] | undefined): boolean {
  if (!conditions?.length) return true;
  return conditions.every((condition) => matchCondition(scope, condition));
}

export function conditionsMatch(context: MechanismContext, conditions: Condition[] | undefined): boolean {
  if (!conditions?.length) return true;
  return conditionsMatchOn(conditionScope(context), conditions);
}
