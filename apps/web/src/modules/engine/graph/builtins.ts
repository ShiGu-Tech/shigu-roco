/** 内建节点库（G1 首批）：事件源 / 流程 / 取值 / 运算 / 比较 / 逻辑 / 写入 / 查询 / 随机。
 *
 * 每个节点只干一件事；「怎么执行」在此（代码），「用哪些 / 怎么连 / 什么参数」在程序（配置）。
 */

import { computeDamage } from "../effects/damage";
import { evalExpr, type Expr } from "../effects/formula";
import { getSprite } from "../data";
import type { Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { NodeContext, NodeExecution, NodePort, StateMutation } from "./types";

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

function mutate(path: string, before: unknown, after: unknown): StateMutation {
  return { path, before, after };
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

  // ---------------------------------------------------------------- 写入（唯一副作用）
  registry.register({
    type: "write.modifyEnergy",
    title: "写入 · 能量",
    category: "write",
    inputs: [anyPort("target")],
    outputs: [],
    controlIn: true,
    controlOut: ["out"],
    params: [{ name: "delta", type: "number", required: true }],
    effect: true,
    executor: (ctx): NodeExecution => {
      const side = (ctx.input("target") as Side | undefined) ?? actorSide(ctx);
      const active = sideOf(ctx.state, side).active;
      const before = active.energy;
      active.energy = Math.max(0, before + Number(ctx.params.delta ?? 0));
      return { mutations: [mutate(`${side}.active.energy`, before, active.energy)] };
    },
  });
  registry.register({
    type: "write.modifyStat",
    title: "写入 · 属性层",
    category: "write",
    inputs: [anyPort("target")],
    outputs: [],
    controlIn: true,
    controlOut: ["out"],
    params: [{ name: "stat", type: "string", required: true }, { name: "value", type: "number", required: true }],
    effect: true,
    executor: (ctx): NodeExecution => {
      const side = (ctx.input("target") as Side | undefined) ?? actorSide(ctx);
      const active = sideOf(ctx.state, side).active;
      const stat = String(ctx.params.stat);
      const before = Number(active.buffs[stat] ?? 0);
      active.buffs[stat] = before + Number(ctx.params.value ?? 0);
      return { mutations: [mutate(`${side}.active.buffs.${stat}`, before, active.buffs[stat])] };
    },
  });
  registry.register({
    type: "write.applyStatus",
    title: "写入 · 状态",
    category: "write",
    inputs: [anyPort("target")],
    outputs: [],
    controlIn: true,
    controlOut: ["out"],
    params: [{ name: "statusId", type: "string", required: true }, { name: "layers", type: "number", default: 1 }],
    effect: true,
    executor: (ctx): NodeExecution => {
      const side = (ctx.input("target") as Side | undefined) ?? actorSide(ctx);
      const active = sideOf(ctx.state, side).active;
      const statusId = String(ctx.params.statusId);
      const before = Number(active.statuses[statusId] ?? 0);
      active.statuses[statusId] = before + Number(ctx.params.layers ?? 1);
      return { mutations: [mutate(`${side}.active.statuses.${statusId}`, before, active.statuses[statusId])] };
    },
  });
  registry.register({
    type: "write.dealDamage",
    title: "写入 · 造成伤害",
    category: "write",
    inputs: [anyPort("target")],
    outputs: [],
    controlIn: true,
    controlOut: ["out"],
    params: [
      { name: "category", type: "string", required: true },
      { name: "power", type: "number", required: true },
      { name: "skillId", type: "string" },
      { name: "element", type: "string" },
    ],
    effect: true,
    executor: (ctx): NodeExecution => {
      const attacker = actorSide(ctx);
      const target = (ctx.input("target") as Side | undefined) ?? other(attacker);
      const attackerActive = sideOf(ctx.state, attacker).active;
      const targetActive = sideOf(ctx.state, target).active;
      const category = String(ctx.params.category ?? "Physical");
      const skill = { category, power: Number(ctx.params.power ?? 0), element: ctx.params.element };
      const result = computeDamage(
        ctx.bundle,
        getSprite(ctx.bundle, attackerActive.spriteId),
        getSprite(ctx.bundle, targetActive.spriteId),
        attackerActive,
        targetActive,
        skill,
        { weatherId: ctx.state.weather?.id ?? null },
      );
      const before = targetActive.hp;
      targetActive.hp = Math.max(0, before - result.damage);
      return { mutations: [mutate(`${target}.active.hp`, before, targetActive.hp)], outputs: { damage: result.damage } };
    },
  });
}
