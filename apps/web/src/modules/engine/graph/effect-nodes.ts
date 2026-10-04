/** 写入节点库（G1/G2）：把现有 effect 原语逐个暴露成 `write.*` 节点。
 *
 * 复用既有语义：节点执行器把命令拼好交给既有 `MechanismRuntime` 结算，不重写任何效果逻辑。
 *
 * G2 编译器口径：
 * - `spec` 参数透传完整 EffectDefinition（含 chance / `*From` 动态引用 / 嵌套 effects）——编译程序零字段丢失，
 *   动态引用仍由 `MechanismRuntime` 在应用期求值（与 dispatch 语义同源）；具名参数 / 数据端口在其上覆盖，留给手工图与 G3b 编辑。
 * - `mechanismId / ownerType / ownerId / effectIndex` 装配 EffectCommand 元数据（事件、chance 盐粒与 dispatch 对齐）。
 * - 行动域效果（cancelAction / forceFirst / setPriority / …）仅在提供 `ctx.actions` 时走 `applyActionCommands`，
 *   否则静默跳过——对齐 triggerState 应用协议（该调用点本就不应用行动域命令）。
 * - 共享 `ctx.runtime`（注册表与 dispatch 同源）：级联触发 / ruleModifiers 与旧路径行为一致。
 */

import { ACTION_EFFECT_TYPES } from "./action-types";
import { resolveEffect, type EffectCommand, type EffectDefinition, type MechanismEvent, type MechanismOwnerType } from "../mechanisms";
import type { Dict, Side } from "../types";
import type { NodeTypeRegistry } from "./registry";
import type { NodeContext, NodeExecution, NodeParam, StateMutation } from "./types";

/** 派发侧：与 `MechanismContext.actorSide` 同语义——**可能为 undefined**（battleStart 等调用点不传），
 *  legacy 对 self 目标且无 side 的命令会跳过，这里不做 "player" 兜底以保持等价。 */
function actorSide(ctx: NodeContext): Side | undefined {
  return ctx.actorSide ?? (ctx.event.actorSide as Side | undefined);
}

/** 所有写入节点的公共参数（编译器装配命令元数据 + 完整 spec 透传）。 */
const COMMON_PARAMS: NodeParam[] = [
  { name: "mechanismId", type: "string" },
  { name: "ownerType", type: "string" },
  { name: "ownerId", type: "string" },
  { name: "effectIndex", type: "number" },
  { name: "spec", type: "json" },
];

/** 元数据参数：装配进 EffectCommand 字段，不进入 `definition`（definition 必须与 DSL 原文逐字段一致）。 */
const META_PARAMS: ReadonlySet<string> = new Set(COMMON_PARAMS.map((param) => param.name));

interface WriteSpec {
  suffix: string;
  title: string;
  /** 手工图（无 spec）缺省目标：self / opponent。 */
  target: "self" | "opponent";
  /** 需要从数据边动态取值的字段（端口名 = EffectSpec 字段名）。 */
  inputs?: string[];
  /** 具名静态参数（名称 = EffectSpec 字段名），覆盖 spec 同名字段。 */
  params?: NodeParam[];
}

const WRITE_NODES: WriteSpec[] = [
  { suffix: "dealDamage", title: "写入 · 造成伤害", target: "opponent", inputs: ["power"], params: [{ name: "category", type: "string", required: true }, { name: "skillId", type: "string" }, { name: "element", type: "string" }] },
  { suffix: "heal", title: "写入 · 治疗", target: "self", inputs: ["amount"], params: [{ name: "basis", type: "string" }] },
  { suffix: "modifyStat", title: "写入 · 属性", target: "self", inputs: ["value"], params: [{ name: "stat", type: "string", required: true }, { name: "mode", type: "string" }, { name: "maxStages", type: "number" }] },
  { suffix: "clearStat", title: "写入 · 驱散属性", target: "self", params: [{ name: "stat", type: "string" }, { name: "polarity", type: "string" }, { name: "limit", type: "number" }] },
  { suffix: "modifyDamage", title: "写入 · 伤害修饰", target: "self", params: [{ name: "mode", type: "string" }, { name: "value", type: "number" }, { name: "scope", type: "string" }] },
  { suffix: "addPower", title: "写入 · 威力加成", target: "self", inputs: ["value"], params: [] },
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
  { suffix: "settleMark", title: "写入 · 印记结算", target: "opponent", params: [{ name: "markId", type: "string", required: true }, { name: "decayLayers", type: "string" }, { name: "delta", type: "number" }] },
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
  { suffix: "swap", title: "写入 · 交换", target: "self", params: [{ name: "what", type: "string", required: true }] },
  { suffix: "setHpRatio", title: "写入 · 生命比例设同", target: "self", params: [{ name: "from", type: "string" }] },
  { suffix: "rotateLoadout", title: "写入 · 技能栏轮转", target: "self", inputs: ["slots"], params: [{ name: "skillId", type: "string" }] },
  { suffix: "addCounter", title: "写入 · 计数器 +", target: "self", inputs: ["delta"], params: [{ name: "key", type: "string", required: true }] },
  { suffix: "setCounter", title: "写入 · 计数器 =", target: "self", inputs: ["value"], params: [{ name: "key", type: "string", required: true }] },
  { suffix: "clearCounter", title: "写入 · 清空计数器", target: "self", params: [{ name: "key", type: "string" }] },
  { suffix: "modifySkill", title: "写入 · 技能永久修正", target: "self", params: [{ name: "skillId", type: "string", required: true }, { name: "power", type: "number" }, { name: "cost", type: "number" }, { name: "hits", type: "number" }, { name: "priority", type: "number" }] },
  { suffix: "changeWeather", title: "写入 · 天气", target: "self", params: [{ name: "weatherId", type: "string", required: true }, { name: "turns", type: "number" }] },
  { suffix: "modifyWeatherTurns", title: "写入 · 延长天气", target: "self", params: [{ name: "weatherId", type: "string" }, { name: "delta", type: "number", required: true }] },
  { suffix: "beginCharge", title: "写入 · 进入蓄力", target: "self", params: [{ name: "skillId", type: "string" }, { name: "choice", type: "number" }] },
  { suffix: "setRuleModifier", title: "写入 · 规则覆盖", target: "self", params: [{ name: "key", type: "string", required: true }, { name: "value", type: "json", required: true }] },
  { suffix: "setPriority", title: "写入 · 行动优先级", target: "self", params: [{ name: "value", type: "number", required: true }] },
  { suffix: "forceFirst", title: "写入 · 强制先手", target: "self", params: [] },
  { suffix: "insertAction", title: "写入 · 插入行动", target: "self", params: [{ name: "action", type: "json", required: true }] },
  { suffix: "cancelAction", title: "写入 · 取消行动", target: "self", params: [] },
  { suffix: "replaceAction", title: "写入 · 替换行动", target: "self", params: [{ name: "action", type: "json", required: true }] },
  { suffix: "unsupported", title: "写入 · 未实现效果", target: "self", params: [{ name: "effectType", type: "string" }, { name: "reason", type: "string" }] },
  { suffix: "learnSkill", title: "写入 · 习得技能", target: "self", params: [{ name: "skillId", type: "string", required: true }, { name: "duration", type: "number" }] },
  { suffix: "forgetSkill", title: "写入 · 遗忘技能", target: "self", params: [{ name: "skillId", type: "string", required: true }] },
  { suffix: "replaceSkill", title: "写入 · 替换技能", target: "self", params: [{ name: "fromSkillId", type: "string", required: true }, { name: "toSkillId", type: "string", required: true }, { name: "duration", type: "number" }] },
  { suffix: "randomizeSkill", title: "写入 · 随机技能", target: "self", params: [{ name: "skillId", type: "string" }, { name: "source", type: "json", required: true }, { name: "duration", type: "number" }] },
  { suffix: "swapSkillSet", title: "写入 · 交换技能", target: "self", params: [{ name: "from", type: "string", required: true }, { name: "to", type: "string", required: true }, { name: "duration", type: "number" }] },
  { suffix: "scheduleEntry", title: "写入 · 入场队列", target: "self", params: [{ name: "effects", type: "json", required: true }] },
  { suffix: "scheduleEffect", title: "写入 · 延迟效果", target: "self", params: [{ name: "effects", type: "json", required: true }, { name: "delay", type: "number" }, { name: "timing", type: "string" }] },
  { suffix: "inheritStat", title: "写入 · 入场继承", target: "self", params: [{ name: "polarity", type: "string" }] },
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
      params: [...COMMON_PARAMS, ...(spec.params ?? [])],
      effect: true,
      executor: (ctx): NodeExecution => {
        const actor = actorSide(ctx);
        const specJson = (ctx.params.spec ?? {}) as Dict;
        const hasSpec = specJson.type !== undefined;
        const targetPort = ctx.input("target") as Side | undefined;
        // 覆盖序：spec 透传 → 具名参数 → 数据端口；target = 端口 > spec > 手工缺省。
        // meta 参数（mechanismId/spec 等）只装配命令字段，不入 definition——definition 必须与 DSL 原文一致。
        const definition: Dict = { ...specJson, type: spec.suffix };
        for (const param of spec.params ?? []) {
          if (META_PARAMS.has(param.name)) continue;
          const value = ctx.params[param.name];
          if (value !== undefined) definition[param.name] = value;
        }
        for (const port of spec.inputs ?? []) {
          const value = ctx.input(port);
          if (value !== undefined) definition[port] = value;
        }
        if (targetPort !== undefined) definition.target = targetPort;
        else if (!hasSpec && definition.target === undefined) definition.target = spec.target;
        // 与 dispatch 同源：skillIdFrom 等收集期引用解析。
        const resolved = resolveEffect(
          {
            state: ctx.state,
            trigger: ctx.trigger,
            sourceId: ctx.sourceId,
            actorSide: actor,
            targetSide: ctx.targetSide,
            action: ctx.action,
            event: ctx.event,
          },
          definition as EffectDefinition,
        );
        const command: EffectCommand = {
          type: spec.suffix as EffectCommand["type"],
          definition: resolved,
          mechanismId: (ctx.params.mechanismId as string | undefined) ?? `write.${spec.suffix}`,
          ownerType: ctx.params.ownerType as MechanismOwnerType | undefined,
          ownerId: ctx.params.ownerId as string | undefined,
          trigger: ctx.trigger,
          actorSide: actor,
          targetSide: ctx.targetSide,
          event: ctx.event,
          effectIndex: ctx.params.effectIndex as number | undefined,
        };
        // collect 模式：只装配命令入缓冲（级联 / ruleModifiers 的应用统一由调用方批量结算）。
        if (ctx.collect) {
          ctx.collect.push(command);
          return { outputs: { events: [] } };
        }
        const before = snapshotHpEnergy(ctx.state);
        const events: MechanismEvent[] = ACTION_EFFECT_TYPES.has(spec.suffix) && ctx.actions
          ? ctx.runtime.applyActionCommands(ctx.actions.queue, [command], ctx.actions.actionIds, ctx.actions.nextActionId)
          : spec.suffix === "dealDamage"
            ? ctx.runtime.applyDamageCommands(ctx.state, ctx.bundle, [command], ctx.extraEvent)
            : ctx.runtime.applyStateCommands(ctx.state, [command], ctx.bundle);
        const after = snapshotHpEnergy(ctx.state);
        const mutations: StateMutation[] = [];
        for (const key of Object.keys(before)) if (before[key] !== after[key]) mutations.push({ path: key, before: before[key], after: after[key] });
        return { outputs: { events }, mutations: mutations.length ? mutations : undefined };
      },
    });
  }
}
