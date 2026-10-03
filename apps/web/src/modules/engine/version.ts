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
 *           `neighborPowerSum` / `neighborPowerDiff`；命令携带 trigger event 使 `event.action.*` 可取。
 * - 0.21.0 内省补强（引擎工作台 W0）：事件保留 `trigger`；伤害事件挂 `computeDamage().breakdown`
 *          （威力 / 属性 / STAB / 克制 / 天气 / 增减伤 / 连击）；经 Worker/REST 暴露 `simulate/legal`（`legalActions`）。
 * - 0.22.0 伤害公式数据化（引擎工作台 P1）：`FormulaSpec`（封闭算子表达式 AST，无 eval）+ `effects/formula.ts`
 *          求值器；`computeDamage` 与预览 `calc.damageOf` 均读 `rules.formula`（缺省回退 `DEFAULT_FORMULA`），同口径。
 * - 0.23.0 执行图运行时段（G0/G1）：`NodeTypeRegistry`（可插拔原语节点）+ `runProgram` 解释器（控制边 / 数据边）
 *          + 逐节点 `TraceEntry`（node/type/inputs/outputs/mutations/parent）+ `validateProgram` / `programHash`；
 *          首批内建节点（事件源 / flow.branch / read / math / logic / cmp / write / query / rng）。
 * - 0.24.0 节点库扩充（G1）：全量 `write.*`（40+ 效果原语，复用 `MechanismRuntime` 结算，图数据流取代 `powerFrom`/
 *          `valueFrom`）、`flow.gate`（每回合一次）、`resource.elements` / `resource.rules`。
 * - 0.25.0 机制编译器（G2a）：`graph/compiler.ts` 把 `mechanisms.json` DSL 编译为程序图（`on.*` 全触发器 → when 条件
 *          子图 → `flow.gate` → `write.*` 链，链序按行动→状态→伤害三段对齐 simulate 应用协议）；写入节点 `spec` 透传
 *          完整 EffectDefinition + 机制元数据（`mechanismId/ownerType/ownerId/effectIndex`），行动域按 `ctx.actions`
 *          路由；节点补齐 `logic.or` / `cmp.has·contains` / `read.ref` / `read.path` 的 `*` 合计 / `flow.gate.withSide`；
 *          `runProgram({ mechanisms, actions })` 共享注册表（级联 / ruleModifiers 与 dispatch 同源）；回归基准：全 480 条
 *          同上下文逐事件 + 终态等价；`cloneState` 保留 `onceFired`（修复中途克隆重置 oncePerTurn 门）。
 * - 0.26.0 程序化 collect（G2b 接线）：`MechanismSource` 收集器接缝（`MechanismRegistry` 与 `ProgramCollector` 可互换），
 *          `Simulator(bundle, mechanisms?)` 可注入；程序源 = 一次 `runProgram(entries, mode:"collect")` 跑全部命中机制链
 *          （shell 上下文复用 + 作用域按调用缓存 + RNG 懒建）；collect 输出按（机制序, effectIndex）复位 DSL 序；
 *          `EffectCommand.effectIndex` 令 chance 盐粒按机制内原序（与 DSL 源一致，数据零 chance 无行为变化）。
 *          **默认源仍为 DSL**：实测程序源 collect ≈ DSL 15x、step ≈ 6–13x（688 条链节点解释的固有开销），
 *          直接切默认会等比吃掉 MCTS 迭代数——性能达标后再切；等价性由 collect 逐命令 + 整场同种子 A/B 守卫。
 * - 0.26.1 AND 脊门控 + 默认源切程序（G2b-1.5）：`mechanisms/relevance.ts` 把 `when` 合取链上可判的叶
 *          （顶层数组 / 嵌套 allOf；anyOf·not 不前置）前置精确求值——任一叶为假 ⇒ 条件树必假，跳过是
 *          **纯短路提前**（叶求值与 `conditionsMatch` 共用 `matchCondition`，零行为变化；两源同门控保 A/B 等价）。
 *          数据普查 695 条全部可门控（682 身份叶 + 13 护盾·reacted 脊叶）。收益：beforeAction 503 条
 *          命中链门控后仅 survivors 进全量求值 / 图行走——程序源 collect 2.4ms→0.19ms、step×4 19.8ms→1.77ms，
 *          与 DSL 同量级（collect / step 差 <±17%），**Simulator 默认源切程序源**（DSL 经注入保留做对照）。
 *          回归：`relevance.test`（合成语义 + 全量 soundness + 骨架等价 + 普查守卫）+ `program-collect` A/B 重跑。
 */
export const ENGINE_VERSION = "0.26.1";
