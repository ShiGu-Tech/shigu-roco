/** 引擎版本（能力面）——与业务系统（`package.json`）**各自独立编号**。
 *
 * 版本只描述「引擎能力」，不描述数据：
 * - **bump minor**：新增机制能力（新触发器 / 新效果命令 / 新规则覆盖通道 / 新结算阶段）。
 * - **bump patch**：修正既有结算语义或能力行为（不新增能力）。
 * - **bump major**：接口 / 契约破坏性变更（握手字段、Action/BattleState 形状、Bundle 形状）。
 * - **不动版本**：新增技能 / 印记 / 状态 / 天气 / 特性 / 规则参数，或它们任意组合——
 *   只要能用现有触发器 + 条件 + 效果命令表达，就只改 `data/*.json` / 图鉴数据，引擎版本不变。
 *
 * 数据版本另计：图鉴 registrationId（`f2bc7789ad9c-…-n7`）+ `dataVersion`；引擎参数各自带 `version`。
 *
 * 历史：
 * - 0.1.0  首个显式版本（基线）：触发器 + 条件 + 效果命令 DSL、事务结算、冷却净 ±N、
 *          `passive` 触发器 + `setRuleModifier` 规则覆盖通道（印记互斥/上限可被特性突破）。
 * - 0.2.0  印记域原语：`setMark` / `scaleMark` / `transferMark`（偷取/转移）/ `transformMark`（收拢），
 *          以及 `applyMark` / `setMark` 的动态层数 `layersFrom`（按当前状态取值）。
 * - 0.3.0  记忆域：`addCounter` / `setCounter` / `clearCounter`（计数器）、`lastTurn`（上回合记忆，回合末自动记录）、
 *          `modifySkill`（技能永久威力/能耗/连击/先手修正）；`setHits` 支持 `hitsFrom` 动态段数。
 * - 0.4.0  强化/状态域：`clearStat`（驱散增减益，含 `limit` 种类数）；`setStatus` / `scaleStatus`（状态动态层 / 缩放）。
 *          能耗域：`modifySkillCost`（按技能/全体/攻击/防御叠加或缩放能耗）。
 *          行动域：`forceSwitch` / `escape` / `allowSwitch`（强制换人 / 脱离 / 解锁，`SideState.forcedSwitch`）。
 *          `removeMark` 省略 `markId` = 驱散该侧全部印记；`applyMark` 支持 `layers + layersFrom` 叠加。
 * - 0.5.0  应对成功判定：技能「应对 X」（站点标签 1015/1016/1017）与敌方行动类型匹配即成功，
 *          自动抬升先手（+100），并在 `actionDeclared` / `beforeAction` / `skillUsed` / `actionResolved`
 *          事件与 `lastTurn` 暴露 `reacted`（供 `event.reacted` / `self.lastTurn.reacted` 条件）。
 * - 0.6.0  带系数动态取值：`DynamicValue`（点路径 + `scale` + `offset` + `round`，路径末尾 `*` = 合计对象数值）；
 *          动态入口扩展到 `dealDamage.powerFrom` / `modifyStat.valueFrom` / `setDamageReduction.percentFrom` /
 *          `heal.amountFrom` / `modifyEnergy.deltaFrom` / `modifySkillCost.deltaFrom`（含 `mode: "set"`）；
 *          新增 `consumeMark`（驱散印记并按每层执行效果，可表达「每层 +X%」）。
 * - 0.7.0  入场继承：`scheduleEntry`（把效果排入目标侧「下个入场精灵」队列，换人时执行）+
 *          `inheritStat`（换人时把离场精灵的强化 / 减益复制给入场精灵）；`SideState.pendingEntry` 随换人清空。
 * - 0.8.0  条件运算符 `contains`（数组包含，用于 `self.active.loadout` 归属守卫），配合被动型机制
 *          （`turnEnd` / `afterSwitch` 的永久修正）只在携带该技能的精灵上触发。
 * - 0.9.0  去特化 + 通用化：`DynamicValue.terms`（多项式，任何非线性按层取值）；`consumeMark.effectsOnConsume`
 *          + 命令级 `event` 绑定（暴露 `event.consumed`）；`onHit` / `afterDamage` 事件暴露 `element`；
 *          `dealDamage` 非技能伤害支持 `element`。据此**移除引擎内星陨特化**（`applyStarfall`）与
 *          **应对的站点标签解析**（改读数据层归一化的通用字段 `skill.reaction`）。
 * - 0.10.0 入场域：新增 `onEntry` 触发器——开局在场与每次换入都派发，事件带
 *          `enteredSpriteId` / `from` / `forced` / `first`；`ActiveSprite.entered` 记录是否首次入场，
 *          供「首次入场」类特性（条件 `event.first`）。不再依赖 `battleStart` 的精灵字段。
 * - 0.11.0 场地/伤害查询面：`modifySkillCost.elements`（按技能元素筛选，表达「地系技能耗减半」等天气/特性）；
 *          `beforeDamage` 事件补 `element`（供按元素筛选伤害修饰，如「雨天水系威力 +75%」）。
 * - 0.12.0 能耗域通用能力：声明式 `ActiveSprite.costMods` + `effectiveCost`（执行 / `legalActions` / 预览同源，floor + clamp≥0）；
 *          `modifySkillCost` 补 `duration`/`turns`/`oncePerTurn`/`hidden`/`dispellable`/`excludeElements`；新增 `clearCostMod`；
 *          `oncePerTurn` 通用限次；aura 来源离场回收（换人 / 阵亡）。
 * - 0.13.0 增减益获得事件 + 图鉴计数：新增 `buffGained` / `debuffGained` 触发器（`modifyStat` 生效后派发，
 *          带 `stat` / `value` / `sourceSide`）；`statusApplied` 事件补 `sourceSide` / `sourceSpriteId`（施加者上下文）；
 *          `DynamicValue.count`（`path` 指向技能 id 数组时按图鉴 `element`/`category`/`actionType` 统计条目数）。
 * - 0.14.0 伤害修饰上下文补全：`beforeDamage`（伤害修饰口径）事件补 `reacted` / 行动上下文，
 *          使「应对成功 → 连击翻倍」等条件连击可由 `setHits` + `event.reacted` 表达。
 * - 0.15.0 条件派生值 + 行动时序：`Condition.valueFrom` 支持 `DynamicRef`（路径 + `scale`/`offset`/`terms`，
 *          可比较 HP 比例等派生值）；本回合首个结算的行动在 `beforeDamage`/`skillUsed`/`actionResolved` 事件暴露 `wentFirst`。
 * - 0.16.0 延迟效果：新增 `scheduleEffect`（把 `effects` 排入目标侧 `pendingEffects`，于 `delay` 回合后的
 *          `turnStart` / `turnEnd` 结算，保留原施法方视角）。
 * - 0.17.0 层数阈值触发：新增 `statusReached` / `markReached` 触发器（状态 / 印记施加后与 `*Applied` 一并派发，
 *          跨阈值由数据 `when` 用 `event.before` / `event.after` 判定），供「满 N 层触发并消耗」类效果。
 * - 0.18.0 对象计数：`DynamicValue.countKeys`（路径指向对象时取其键数量，如「每有 1 种减益」）。
 * - 0.19.0 迸发标记：`ActiveSprite.actedSinceEntry` + 本回合行动事件暴露 `burst`（入场首次行动为真，换人重置），
 *          供「迸发：入场首次行动额外效果」类条件。
 * - 0.20.0 技能栏位置域：`loadout` 升级为有序技能栏；新增 `rotateLoadout`（传动下移）与 `addPower`（条件威力加成）
 *          效果、`CostMod.slots`（按槽位筛选能耗）；`turnStart` 改为按侧派发，行动事件暴露 `slot` /
 *          `neighborPowerSum` / `neighborPowerDiff`；命令携带 trigger event 使 `event.action.*` 可取。
 */
export const ENGINE_VERSION = "0.20.0";
