/** 内建节点库（G1 首批）：事件源 / 流程 / 取值 / 运算 / 比较 / 逻辑 / 写入 / 查询 / 随机。
 *
 * 每个节点只干一件事；「怎么执行」在此（代码），「用哪些 / 怎么连 / 什么参数」在程序（配置）。
 */

import { evalExpr, type Expr } from "../effects/formula";
import type { Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { NodeContext, NodeExecution, NodePort } from "./types";

const anyPort = (name: string): NodePort => ({ name, type: "any" });

function sideOf(state: NodeContext["state"], side: Side) {
  return side === "player" ? state.player : state.enemy;
}

function actorSide(ctx: NodeContext): Side {
  return (ctx.event.actorSide as Side | undefined) ?? "player";
}

function other(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

function readPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

function scope(ctx: NodeContext): Record<string, unknown> {
  const actor = actorSide(ctx);
  const target = other(actor);
  return {
    state: ctx.state,
    event: ctx.event,
    turn: ctx.state.turn,
    self: sideOf(ctx.state, actor),
    actor: sideOf(ctx.state, actor),
    target: sideOf(ctx.state, target),
    opponent: sideOf(ctx.state, target),
  };
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
  eventNode("on.battleStart", "战斗开始");
  eventNode("on.turnStart", "回合开始");
  eventNode("on.beforeAction", "行动前");
  eventNode("on.beforeDamage", "伤害前");
  eventNode("on.afterDamage", "伤害后");
  eventNode("on.turnEnd", "回合结束");

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
    params: [{ name: "key", type: "string", required: true }],
    effect: true,
    executor: (ctx): NodeExecution => {
      const key = String(ctx.params.key);
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
