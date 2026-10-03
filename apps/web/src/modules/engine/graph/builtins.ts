/** 内建节点库（G1/G2）：事件源 / 流程 / 取值 / 运算 / 比较 / 逻辑 / 写入 / 查询 / 随机。
 *
 * 每个节点只干一件事；「怎么执行」在此（代码），「用哪些 / 怎么连 / 什么参数」在程序（配置）。
 * G2 补齐：`on.*` 全触发器、`logic.or`、`cmp.has/contains`、`read.ref`（动态引用）、`read.path` 的 `*` 合计、`flow.gate` 阵营键。
 */

import { evalExpr, type Expr } from "../effects/formula";
import { resolveRef } from "../mechanisms/conditions";
import { triggerMetaOf, TRIGGER_NAMES } from "../mechanisms/vocabulary";
import type { DynamicRef } from "../mechanisms";
import type { Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { NodeContext, NodeExecution, NodePort } from "./types";

const anyPort = (name: string): NodePort => ({ name, type: "any" });

function sideOf(state: NodeContext["state"], side: Side) {
  return side === "player" ? state.player : state.enemy;
}

function actorSide(ctx: NodeContext): Side {
  return ctx.actorSide ?? (ctx.event.actorSide as Side | undefined) ?? "player";
}

function other(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

/** 点路径取值；末尾 `*` = 合计该对象全部数值（与 conditions.readPath 同语义，条件子图零漂移）。 */
function readPath(root: unknown, path: string): unknown {
  const keys = path.split(".");
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

/** 条件作用域：与 mechanisms/conditions 的 scope **逐字段同构**（self/actor/target/opponent 取侧状态、
 *  缺 side 时为 undefined；trigger / action / sourceId / actorSide / targetSide 根同 conditions 展开）。
 *  条件子图与 `conditionsMatch` 必须在同一作用域求值，否则等价性破防。
 *  按 ctx 对象缓存：一次 runProgram 调用内 state/event/侧引用恒定（含 onceFired 原地变更，按引用可见）。 */
const scopeCache = new WeakMap<object, Record<string, unknown>>();

function scope(ctx: NodeContext): Record<string, unknown> {
  const cached = scopeCache.get(ctx as unknown as object);
  if (cached) return cached;
  const actor = ctx.actorSide ?? (ctx.event.actorSide as Side | undefined);
  const target = ctx.targetSide;
  const built: Record<string, unknown> = {
    state: ctx.state,
    trigger: ctx.trigger,
    sourceId: ctx.sourceId,
    action: ctx.action,
    actorSide: actor,
    targetSide: target,
    event: ctx.event,
    self: actor ? sideOf(ctx.state, actor) : undefined,
    actor: actor ? sideOf(ctx.state, actor) : undefined,
    target: target ? sideOf(ctx.state, target) : undefined,
    opponent: target ? sideOf(ctx.state, target) : undefined,
  };
  scopeCache.set(ctx as unknown as object, built);
  return built;
}

export function registerBuiltins(registry: NodeTypeRegistry): void {
  // ---------------------------------------------------------------- 事件源
  const eventNode = (type: string, title: string): void => {
    registry.register({
      type,
      title,
      category: "event",
      inputs: [],
      outputs: [{ name: "event", type: "event" }],
      controlIn: false,
      controlOut: ["out"],
      params: [],
      executor: (ctx) => ({ outputs: { event: { turn: ctx.state.turn, side: ctx.event.side ?? null } }, control: ["out"] }),
    });
  };
  // ---------------------------------------------------------------- 事件源（全触发器，与 TriggerName/词汇表同源）
  for (const name of TRIGGER_NAMES) {
    eventNode(`on.${name}`, triggerMetaOf(name).title);
  }

  // ---------------------------------------------------------------- 流程
  registry.register({
    type: "flow.branch",
    title: "分支",
    category: "flow",
    inputs: [anyPort("cond")],
    outputs: [],
    controlIn: true,
    controlOut: ["then", "else"],
    params: [{ name: "negate", type: "boolean", default: false }],
    executor: (ctx) => {
      const cond = Boolean(ctx.input("cond"));
      const positive = ctx.params.negate ? !cond : cond;
      return { control: [positive ? "then" : "else"] };
    },
  });

  registry.register({
    type: "flow.gate",
    title: "门 · 每回合一次",
    category: "flow",
    inputs: [],
    outputs: [],
    controlIn: true,
    controlOut: ["out"],
    params: [
      { name: "key", type: "string", required: true },
      { name: "withSide", type: "boolean", default: false },
    ],
    effect: true,
    executor: (ctx): NodeExecution => {
      // withSide 对齐 dispatch 的 oncePerTurn 键：`${actorSide ?? "-"}:${机制 id}`。
      const raw = String(ctx.params.key);
      const key = ctx.params.withSide ? `${ctx.actorSide ?? "-"}:${raw}` : raw;
      ctx.state.onceFired ??= {};
      if (ctx.state.onceFired[key]) return { control: [] };
      ctx.state.onceFired[key] = true;
      return { control: ["out"] };
    },
  });

  // ---------------------------------------------------------------- 资源
  registry.register({
    type: "resource.elements",
    title: "资源 · 系别克制",
    category: "resource",
    inputs: [],
    outputs: [{ name: "matrix", type: "object" }, { name: "values", type: "object" }, { name: "combine", type: "object" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => {
      const elements = (ctx.bundle.elements ?? {}) as Record<string, unknown>;
      return { outputs: { matrix: elements.matrix ?? {}, values: elements.values ?? {}, combine: elements.combine ?? {} } };
    },
  });
  registry.register({
    type: "resource.rules",
    title: "资源 · 规则",
    category: "resource",
    inputs: [],
    outputs: [{ name: "rules", type: "object" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { rules: ctx.bundle.rules ?? {} } }),
  });

  // ---------------------------------------------------------------- 取值
  registry.register({
    type: "read.literal",
    title: "常量",
    category: "read",
    inputs: [],
    outputs: [{ name: "value", type: "any" }],
    params: [{ name: "value", type: "json" }],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { value: ctx.params.value } }),
  });
  registry.register({
    type: "read.path",
    title: "取值（路径）",
    category: "read",
    inputs: [],
    outputs: [{ name: "value", type: "any" }],
    params: [{ name: "path", type: "path", required: true }],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { value: readPath(scope(ctx), String(ctx.params.path)) } }),
  });
  registry.register({
    type: "read.ref",
    title: "取值（动态引用）",
    category: "read",
    inputs: [],
    outputs: [{ name: "value", type: "any" }],
    params: [{ name: "ref", type: "json", required: true }],
    pure: true,
    // 复用 conditions.resolveRef（路径 + 系数 / 偏移 / 多项式）——条件 valueFrom 与 conditionsMatch 同一求值。
    executor: (ctx): NodeExecution => ({ outputs: { value: resolveRef(scope(ctx), ctx.params.ref as DynamicRef) } }),
  });
  registry.register({
    type: "read.countKeys",
    title: "计数（对象键数）",
    category: "read",
    inputs: [anyPort("object")],
    outputs: [{ name: "value", type: "number" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => {
      const value = ctx.input("object");
      return { outputs: { value: value && typeof value === "object" ? Object.keys(value as object).length : 0 } };
    },
  });

  // ---------------------------------------------------------------- 运算
  registry.register({
    type: "math.expr",
    title: "表达式",
    category: "math",
    inputs: [anyPort("vars")],
    outputs: [{ name: "value", type: "number" }],
    params: [{ name: "expr", type: "json", required: true }],
    pure: true,
    executor: (ctx): NodeExecution => {
      const vars = (ctx.input("vars") as Record<string, number> | undefined) ?? {};
      return { outputs: { value: evalExpr(ctx.params.expr as Expr, vars) } };
    },
  });
  for (const op of ["add", "sub", "mul", "div", "min", "max"] as const) {
    registry.register({
      type: `math.${op}`,
      title: `运算 · ${op}`,
      category: "math",
      inputs: [anyPort("a"), anyPort("b")],
      outputs: [{ name: "value", type: "number" }],
      params: [],
      pure: true,
      executor: (ctx): NodeExecution => {
        const a = Number(ctx.input("a") ?? 0);
        const b = Number(ctx.input("b") ?? 0);
        const value = op === "add" ? a + b : op === "sub" ? a - b : op === "mul" ? a * b : op === "div" ? a / b : op === "min" ? Math.min(a, b) : Math.max(a, b);
        return { outputs: { value } };
      },
    });
  }
  registry.register({
    type: "math.floor",
    title: "取整 · floor",
    category: "math",
    inputs: [anyPort("a")],
    outputs: [{ name: "value", type: "number" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { value: Math.floor(Number(ctx.input("a") ?? 0)) } }),
  });

  // ---------------------------------------------------------------- 逻辑 / 比较
  registry.register({
    type: "logic.not",
    title: "逻辑非",
    category: "logic",
    inputs: [anyPort("a")],
    outputs: [{ name: "value", type: "boolean" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { value: !ctx.input("a") } }),
  });
  registry.register({
    type: "logic.and",
    title: "逻辑与",
    category: "logic",
    inputs: [anyPort("a"), anyPort("b")],
    outputs: [{ name: "value", type: "boolean" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { value: Boolean(ctx.input("a")) && Boolean(ctx.input("b")) } }),
  });
  registry.register({
    type: "logic.or",
    title: "逻辑或",
    category: "logic",
    inputs: [anyPort("a"), anyPort("b")],
    outputs: [{ name: "value", type: "boolean" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => ({ outputs: { value: Boolean(ctx.input("a")) || Boolean(ctx.input("b")) } }),
  });
  for (const op of ["eq", "neq", "gt", "gte", "lt", "lte"] as const) {
    registry.register({
      type: `cmp.${op}`,
      title: `比较 · ${op}`,
      category: "cmp",
      inputs: [anyPort("a"), anyPort("b")],
      outputs: [{ name: "value", type: "boolean" }],
      params: [],
      pure: true,
      executor: (ctx): NodeExecution => {
        const a = ctx.input("a");
        const b = ctx.input("b");
        const value =
          op === "eq" ? a === b : op === "neq" ? a !== b : op === "gt" ? Number(a) > Number(b) : op === "gte" ? Number(a) >= Number(b) : op === "lt" ? Number(a) < Number(b) : Number(a) <= Number(b);
        return { outputs: { value } };
      },
    });
  }
  registry.register({
    type: "cmp.in",
    title: "比较 · in",
    category: "cmp",
    inputs: [anyPort("a"), anyPort("b")],
    outputs: [{ name: "value", type: "boolean" }],
    params: [],
    pure: true,
    executor: (ctx): NodeExecution => {
      const b = ctx.input("b");
      return { outputs: { value: Array.isArray(b) && b.includes(ctx.input("a")) } };
    },
  });
  registry.register({
    type: "cmp.contains",
    title: "比较 · contains",
    category: "cmp",
    inputs: [anyPort("a"), anyPort("b")],
    outputs: [{ name: "value", type: "boolean" }],
    params: [],
    pure: true,
    // conditions.contains：actual 数组包含 expected。
    executor: (ctx): NodeExecution => {
      const a = ctx.input("a");
      return { outputs: { value: Array.isArray(a) && a.includes(ctx.input("b")) } };
    },
  });
  registry.register({
    type: "cmp.has",
    title: "比较 · has",
    category: "cmp",
    inputs: [anyPort("a"), anyPort("b")],
    outputs: [{ name: "value", type: "boolean" }],
    params: [],
    pure: true,
    // conditions.has：对象键存在性（expected 为键名）。
    executor: (ctx): NodeExecution => {
      const a = ctx.input("a");
      const b = ctx.input("b");
      const value = Boolean(
        a && typeof a === "object" && (typeof b === "string" || typeof b === "number" || typeof b === "symbol") && b in (a as object),
      );
      return { outputs: { value } };
    },
  });

  // ---------------------------------------------------------------- 查询 / 随机
  registry.register({
    type: "query.side",
    title: "解析阵营",
    category: "query",
    inputs: [],
    outputs: [{ name: "side", type: "side" }],
    params: [{ name: "from", type: "string", default: "actor" }],
    pure: true,
    executor: (ctx): NodeExecution => {
      const from = String(ctx.params.from ?? "actor");
      const side: Side = from === "target" || from === "opponent" ? other(actorSide(ctx)) : (from === "player" || from === "enemy" ? from : actorSide(ctx));
      return { outputs: { side } };
    },
  });
  registry.register({
    type: "rng.int",
    title: "随机整数 [0,n)",
    category: "rng",
    inputs: [anyPort("max")],
    outputs: [{ name: "value", type: "number" }],
    params: [{ name: "max", type: "number", default: 1 }],
    executor: (ctx): NodeExecution => {
      const max = Math.max(1, Math.floor(Number(ctx.input("max") ?? ctx.params.max ?? 1)));
      return { outputs: { value: Math.min(max - 1, Math.floor(ctx.rng() * max)) } };
    },
  });

}
