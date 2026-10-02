/** 写入节点库（G1）：把现有 effect 原语逐个暴露成 `write.*` 节点。
 *
 * 复用既有语义：节点执行器把输入/参数拼成 `EffectSpec`，交给既有 `MechanismRuntime` 结算，
 * 不重写任何效果逻辑；图（数据流）取代原来的 `powerFrom` / `valueFrom` 动态引用。
 */

import { MechanismRegistry, MechanismRuntime } from "../mechanisms";
import type { EffectCommand, EffectSpec, MechanismEvent } from "../mechanisms";
import type { Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { NodeContext, NodeExecution, NodeParam, StateMutation } from "./types";

const runtime = new MechanismRuntime(new MechanismRegistry());

function actorSide(ctx: NodeContext): Side {
  return (ctx.event.actorSide as Side | undefined) ?? "player";
}
function other(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

interface WriteSpec {
  suffix: string;
  title: string;
  /** 默认目标（无 `target` 连线时）：self / opponent。 */
  target: "self" | "opponent";
  /** 需要从数据边动态取值的字段（端口名 = EffectSpec 字段名）。 */
  inputs?: string[];
  /** 静态参数（名称 = EffectSpec 字段名）。 */
  params?: NodeParam[];
}

const WRITE_NODES: WriteSpec[] = [
  { suffix: "dealDamage", title: "写入 · 造成伤害", target: "opponent", inputs: ["power"], params: [{ name: "category", type: "string", required: true }, { name: "skillId", type: "string" }, { name: "element", type: "string" }] },
  { suffix: "heal", title: "写入 · 治疗", target: "self", inputs: ["amount"], params: [{ name: "basis", type: "string" }] },
  { suffix: "modifyStat", title: "写入 · 属性", target: "self", inputs: ["value"], params: [{ name: "stat", type: "string", required: true }, { name: "mode", type: "string" }, { name: "maxStages", type: "number" }] },
  { suffix: "clearStat", title: "写入 · 驱散属性", target: "self", params: [{ name: "stat", type: "string" }, { name: "polarity", type: "string" }, { name: "limit", type: "number" }] },
  { suffix: "modifyDamage", title: "写入 · 伤害修饰", target: "self", params: [{ name: "mode", type: "string" }, { name: "value", type: "number" }, { name: "scope", type: "string" }] },
  { suffix: "setHits", title: "写入 · 连击段数", target: "self", inputs: ["hits"], params: [{ name: "markId", type: "string" }, { name: "base", type: "number" }, { name: "perStack", type: "number" }] },
  { suffix: "setDamageReduction", title: "写入 · 减伤", target: "self", inputs: ["percent"], params: [] },
  { suffix: "applyStatus", title: "写入 · 施加状态", target: "opponent", inputs: ["layers"], params: [{ name: "statusId", type: "string", required: true }] },
  { suffix: "setStatus", title: "写入 · 设置状态层数", target: "opponent", inputs: ["layers"], params: [{ name: "statusId", type: "string", required: true }] },
  { suffix: "scaleStatus", title: "写入 · 缩放状态", target: "opponent", params: [{ name: "statusId", type: "string" }, { name: "factor", type: "number" }, { name: "delta", type: "number" }] },
  { suffix: "settleStatus", title: "写入 · 状态结算", target: "opponent", params: [{ name: "statusId", type: "string", required: true }, { name: "decayLayers", type: "string" }, { name: "delta", type: "number" }] },
  { suffix: "removeStatus", title: "写入 · 移除状态", target: "opponent", params: [{ name: "statusId", type: "string", required: true }] },
  { suffix: "applyMark", title: "写入 · 施加印记", target: "opponent", inputs: ["layers"], params: [{ name: "markId", type: "string", required: true }, { name: "scope", type: "string" }] },
  { suffix: "setMark", title: "写入 · 设置印记层数", target: "opponent", inputs: ["layers"], params: [{ name: "markId", type: "string", required: true }, { name: "scope", type: "string" }] },
  { suffix: "scaleMark", title: "写入 · 缩放印记", target: "opponent", params: [{ name: "markId", type: "string" }, { name: "factor", type: "number" }, { name: "delta", type: "number" }, { name: "scope", type: "string" }] },
  { suffix: "transferMark", title: "写入 · 转移印记", target: "self", params: [{ name: "markId", type: "string" }, { name: "amount", type: "number" }, { name: "from", type: "string" }, { name: "to", type: "string" }] },
  { suffix: "transformMark", title: "写入 · 收拢印记", target: "opponent", params: [{ name: "toMarkId", type: "string", required: true }, { name: "scope", type: "string" }] },
  { suffix: "removeMark", title: "写入 · 移除印记", target: "opponent", params: [{ name: "markId", type: "string" }, { name: "layers", type: "number" }, { name: "scope", type: "string" }] },
  { suffix: "consumeMark", title: "写入 · 消耗印记", target: "opponent", params: [{ name: "markId", type: "string" }, { name: "scope", type: "string" }, { name: "effectsPerLayer", type: "json" }, { name: "effectsOnConsume", type: "json" }] },
  { suffix: "modifySkillCost", title: "写入 · 技能能耗", target: "self", inputs: ["delta"], params: [{ name: "skillId", type: "string" }, { name: "scope", type: "string" }, { name: "multiply", type: "number" }, { name: "duration", type: "string" }, { name: "key", type: "string" }] },
  { suffix: "clearCostMod", title: "写入 · 驱散能耗", target: "self", params: [{ name: "all", type: "boolean" }] },
  { suffix: "modifyCooldown", title: "写入 · 冷却", target: "self", inputs: ["delta"], params: [{ name: "skillId", type: "string" }, { name: "scope", type: "string" }, { name: "minimum", type: "number" }] },
  { suffix: "modifyEnergy", title: "写入 · 能量", target: "self", inputs: ["delta"], params: [] },
  { suffix: "modifyMagic", title: "写入 · 魔力", target: "opponent", inputs: ["delta"], params: [] },
  { suffix: "modifySwitchLock", title: "写入 · 离场锁", target: "opponent", inputs: ["delta"], params: [] },
  { suffix: "forceSwitch", title: "写入 · 强制换人", target: "self", params: [] },
  { suffix: "escape", title: "写入 · 脱离", target: "self", params: [] },
  { suffix: "allowSwitch", title: "写入 · 解除离场锁", target: "self", params: [] },
  { suffix: "rotateLoadout", title: "写入 · 技能栏轮转", target: "self", inputs: ["slots"], params: [{ name: "skillId", type: "string" }] },
  { suffix: "addCounter", title: "写入 · 计数器 +", target: "self", inputs: ["delta"], params: [{ name: "key", type: "string", required: true }] },
  { suffix: "setCounter", title: "写入 · 计数器 =", target: "self", inputs: ["value"], params: [{ name: "key", type: "string", required: true }] },
  { suffix: "clearCounter", title: "写入 · 清空计数器", target: "self", params: [{ name: "key", type: "string" }] },
  { suffix: "modifySkill", title: "写入 · 技能永久修正", target: "self", params: [{ name: "skillId", type: "string", required: true }, { name: "power", type: "number" }, { name: "cost", type: "number" }, { name: "hits", type: "number" }, { name: "priority", type: "number" }] },
  { suffix: "changeWeather", title: "写入 · 天气", target: "self", params: [{ name: "weatherId", type: "string", required: true }, { name: "turns", type: "number" }] },
  { suffix: "setPriority", title: "写入 · 行动优先级", target: "self", params: [{ name: "value", type: "number", required: true }] },
  { suffix: "forceFirst", title: "写入 · 强制先手", target: "self", params: [] },
  { suffix: "insertAction", title: "写入 · 插入行动", target: "self", params: [{ name: "action", type: "json", required: true }] },
  { suffix: "cancelAction", title: "写入 · 取消行动", target: "self", params: [] },
  { suffix: "replaceAction", title: "写入 · 替换行动", target: "self", params: [{ name: "action", type: "json", required: true }] },
  { suffix: "learnSkill", title: "写入 · 习得技能", target: "self", params: [{ name: "skillId", type: "string", required: true }, { name: "duration", type: "number" }] },
  { suffix: "forgetSkill", title: "写入 · 遗忘技能", target: "self", params: [{ name: "skillId", type: "string", required: true }] },
  { suffix: "replaceSkill", title: "写入 · 替换技能", target: "self", params: [{ name: "fromSkillId", type: "string", required: true }, { name: "toSkillId", type: "string", required: true }, { name: "duration", type: "number" }] },
  { suffix: "randomizeSkill", title: "写入 · 随机技能", target: "self", params: [{ name: "skillId", type: "string" }, { name: "source", type: "json", required: true }, { name: "duration", type: "number" }] },
  { suffix: "swapSkillSet", title: "写入 · 交换技能", target: "self", params: [{ name: "from", type: "string", required: true }, { name: "to", type: "string", required: true }, { name: "duration", type: "number" }] },
];

function snapshotHpEnergy(state: NodeContext["state"]): Record<string, number> {
  return {
    "player.active.hp": state.player.active.hp,
    "enemy.active.hp": state.enemy.active.hp,
    "player.active.energy": state.player.active.energy,
    "enemy.active.energy": state.enemy.active.energy,
  };
}

export function registerEffectNodes(registry: NodeTypeRegistry): void {
  for (const spec of WRITE_NODES) {
    registry.register({
      type: `write.${spec.suffix}`,
      title: spec.title,
      category: "write",
      inputs: [{ name: "target", type: "side" }, ...(spec.inputs ?? []).map((name) => ({ name, type: "any" as const }))],
      outputs: [{ name: "events", type: "object" }],
      controlIn: true,
      controlOut: ["out"],
      params: spec.params ?? [],
      effect: true,
      executor: (ctx): NodeExecution => {
        const actor = actorSide(ctx);
        const targetPort = ctx.input("target") as Side | undefined;
        const definition: Record<string, unknown> = { type: spec.suffix, target: targetPort ?? spec.target };
        for (const param of spec.params ?? []) {
          const value = ctx.params[param.name];
          if (value !== undefined) definition[param.name] = value;
        }
        for (const port of spec.inputs ?? []) {
          const value = ctx.input(port);
          if (value !== undefined) definition[port] = value;
        }
        const command = { type: spec.suffix, definition: definition as EffectSpec, mechanismId: `write.${spec.suffix}`, trigger: "beforeAction" as const, actorSide: actor, targetSide: other(actor) } as unknown as EffectCommand;
        const before = snapshotHpEnergy(ctx.state);
        const events: MechanismEvent[] =
          spec.suffix === "dealDamage"
            ? runtime.applyDamageCommands(ctx.state, ctx.bundle, [command])
            : runtime.applyStateCommands(ctx.state, [command], ctx.bundle);
        const after = snapshotHpEnergy(ctx.state);
        const mutations: StateMutation[] = [];
        for (const key of Object.keys(before)) if (before[key] !== after[key]) mutations.push({ path: key, before: before[key], after: after[key] });
        return { outputs: { events }, mutations: mutations.length ? mutations : undefined };
      },
    });
  }
}
