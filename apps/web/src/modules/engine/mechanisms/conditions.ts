import type { Condition, MechanismContext } from "./types";

function readPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

function matches(actual: unknown, condition: Condition): boolean {
  switch (condition.op) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "gt":
      return Number(actual) > Number(condition.value);
    case "gte":
      return Number(actual) >= Number(condition.value);
    case "lt":
      return Number(actual) < Number(condition.value);
    case "lte":
      return Number(actual) <= Number(condition.value);
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "has":
      return Boolean(
        actual &&
          typeof actual === "object" &&
          (typeof condition.value === "string" || typeof condition.value === "number" || typeof condition.value === "symbol") &&
          condition.value in actual,
      );
  }
}

export function conditionsMatch(context: MechanismContext, conditions: Condition[] | undefined): boolean {
  if (!conditions?.length) return true;
  return conditions.every((condition) => matches(readPath({ ...context, event: context.event }, condition.path), condition));
}
