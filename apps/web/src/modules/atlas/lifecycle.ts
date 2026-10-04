/** 回合生命周期骨架（静态表）：全景图主轴，与 `simulator/battle.ts#step` 实际派发顺序对齐。
 *
 * 漂移守卫：`__tests__/atlas.test.ts` 断言「骨架触发器 ⊆ 词表」+ 「挂载计数 = 机制分组结果」。
 * `unwired` = 词表存在但模拟器当前不派发的触发器（全仓无 `trigger: "<name>"` 运行时调用点），灰态展示。
 */

export interface AtlasStage {
  id: string;
  title: string;
  note?: string;
  /** 本阶段挂载的触发器名（`TriggerName`）。 */
  triggers: string[];
}

export const ATLAS_STAGES: readonly AtlasStage[] = [
  { id: "open", title: "开局", note: "仅第 1 回合", triggers: ["battleStart", "onEntry"] },
  { id: "turn-start", title: "回合开始", note: "按侧派发 + 延迟效果（turnStart）", triggers: ["turnStart"] },
  { id: "wish", title: "愿力", note: "内置动作，无触发器" , triggers: [] },
  { id: "switch", title: "换人", note: "换出 → 入场 → 换入完成", triggers: ["beforeSwitch", "onEntry", "afterSwitch"] },
  { id: "declare", title: "行动宣告与排序", note: "扩展层可修改行动队列", triggers: ["actionDeclared"] },
  { id: "resolve", title: "行动结算", note: "队列按优先级 / 速度逐条", triggers: ["beforeAction", "skillUsed", "actionResolved"] },
  { id: "damage", title: "伤害结算", note: "技能伤害链", triggers: ["beforeDamage", "onHit", "afterDamage"] },
  { id: "turn-end", title: "回合结束", note: "按侧结算 + 延迟效果（turnEnd）+ 环境衰减", triggers: ["turnEnd"] },
  { id: "death", title: "阵亡", note: "生命归零后", triggers: ["beforeDeath", "afterDeath"] },
  { id: "cascade", title: "实体级联", note: "任意效果之后随时派发", triggers: ["statusApplied", "statusReached", "markApplied", "markReached", "buffGained", "debuffGained"] },
  { id: "passive", title: "被动查询", note: "按需读取，不计入回合流", triggers: ["passive"] },
];

/** 词表已有、模拟器暂不派发的触发器（灰态「未接线」）。 */
export const UNWIRED_TRIGGERS: readonly string[] = [
  "beforeActionOrder",
  "actionOrderResolved",
  "beforeEffect",
  "afterEffect",
  "battleEnd",
  "weatherChanged",
  "skillCooldownReduced",
];

/** 骨架覆盖的触发器集合（含未接线）。 */
export function skeletonTriggers(): string[] {
  return [...new Set([...ATLAS_STAGES.flatMap((stage) => stage.triggers), ...UNWIRED_TRIGGERS])];
}
