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
 * - 0.27.0 连击数 buff（`mechanisms/runtime.ts` 伤害结算）：攻击方 `counters["combo-add"]`（+N 段）与
 *          `counters["combo-mul"]`（+N% 段，1 = +100%）在技能自身段数之上叠加（`floor((hits + add) * (1 + mul))`）；
 *          供「获得连击数 +N / −N / +100%」类技能（暴风眼 / 耀眼 / 惊鸿一瞥 / 羽翼庇护 …）经 `addCounter` 纯数据登记。
 * - 0.28.0 眩晕（`simulator/battle.ts` 行动结算）：行动结算前若在者 `counters["stun"] >= 1`，则本回合跳过该行动并清零，
 *          产出 `stun` 事件；供「打断 + 敌下回合眩晕」类技能（摇篮曲 / 芳香诱引 / 龙守望）经 `addCounter stun` 登记。
 * - 0.29.0 交换 / 生命比例设同（`mechanisms/runtime.ts`）：新增 `swap`（`what: hpRatio` 交换生命比例 /
 *          `skills` 交换技能栏 / `stats` 交换增益减益）与 `setHpRatio`（自身比例设为与对手相同）；供 恶念交换 /
 *          隐藏条款 / 欺诈契约 / 假冒 等登记。
 * - 0.30.0 吸血（`mechanisms/runtime.ts` 伤害结算）：攻击方 `counters["lifesteal"]`（比例）按本次实际伤害回复自身生命
 *          （产出 `lifesteal` 事件）；供 等价交换 等「获得 X% 吸血」经 `addCounter lifesteal` 登记。
 * - 0.31.0 天气延长（`mechanisms/runtime.ts`）：新增 `modifyWeatherTurns`（`weatherId` 可省略，匹配则增减当前天气
 *          `turnsLeft`）；供 汇流「雨天延长 4 / 8 回合」登记。
 * - 0.32.0 巧变能耗（`cost.ts` + `state.ts`）：`skillOverrides` 条目可带 `cost`（临时技能能耗修正），
 *          `randomizeSkill` 新增 `costDelta`；`effectiveCost` 计入——供「巧变：变为随机技能且能耗 −1」登记。
 * - 0.33.0 选择（行动模型）：`Action.choice`（0 明 / 1 暗，省略 = 明）；`legalActions` 对描述含「选择」的技能
 *          列出两条；事件 `event.action.choice` 暴露当前选择，供数据用 `choice neq 1 / eq 1` 分叉。
 * - 0.34.0 蓄力（行动模型）：`ActiveSprite.pendingSkill` + `beginCharge`（进入蓄力 + 离场锁）；使用时 `step`
 *          把该侧行动替换为 `released:true` 的自动释放（忽略输入），释放后清空；`server.ts` 跳过描述以「蓄力」开头的
 *          技能的基础伤害自动生成，改由数据在 release 时机登记。
 * - 0.35.0 随机属性减益 + 技能 tag（`mechanisms/runtime.ts` / `data.ts`）：新增 `randomStatDebuff`（确定性种子向随机属性
 *          各扣 N 层，供 暗涌印记登记）；`buildBundle` 由图鉴描述派生技能 `tags`（蓄力 / 选择 / 巧变 / 迸发 / 传动 /
 *          奉献目标），仅作查询面。
 * - 0.36.0 奉献（队伍域）：`SideState.dedications` + `grantDedication`（入队，`key` 省略随机）/ `consumeDedication`
 *          （消耗一个并作用到技能本次使用：威力 / 连击 / 能耗 / 吸血，一次性计数器 `ded-*` 读取后清零）。
 * - 0.37.0 下一次攻击加成（`mechanisms/runtime.ts`）：伤害结算读一次性计数器 `next-damage-mul`（+N% 伤害）与
 *          `next-power-add`（+N 威力），读取后清零；供「应对成功后下次攻击威力翻倍 / +50」类（淬火 / 暖气 / 圣火骑士）。
 * - 0.38.0 队伍域 · 队伍与历史计数（`simulator/battle.ts`）：开局按图鉴预计算 `SideState.counters`
 *          （`team<Element>` 队伍各系只数 / `loadout<Element>` 携带各系技能数 / `loadoutCost` 携带总能耗 /
 *          `loadoutElements` 携带系别种数）；战斗中自增 `used<Element>`、`usedType<ActionType>`、`skillUsed`、
 *          `reacts`（成功应对）、`charges`（聚能）、`switches`、`faints`；`LastTurn` 补 `cost`；
 *          `applyStatus` 支持 `layersFrom`（动态层数）。供「每使用过 1 次 X 系 / 每应对 / 每聚能 / 每力竭」类特性。
 * - 0.39.0 致命域 · 致命拦截（`simulator/battle.ts` + `触发 beforeFatal`）：`handleFaints` 在结算阵亡前派发
 *          `beforeFatal`，机制把生命拉回 >0 即免于阵亡（不死鸟 / 化茧 / 不朽）。
 * - 0.40.0 `skillUsed` 事件补 `cost`（实际能耗，供「释放 N 能耗技能」类印记 / 特性，如龙噬印记）。
 * - 0.41.0 强化域 · 属性层数缩放 / 增益转状态原语：`scaleStat`（按极性缩放 buff/debuff 层数）、
 *          `convertBuffToStatus`（把目标全部增益转为等量状态层数并清空增益）；供落井下毒 / 灰色肖像 / 毒雾。
 * - 0.42.0 图鉴域 · 系别注入：`ActiveSprite.element`（从图鉴 `elements` 注入运行时精灵），
 *          供「非本系技能」「非敌方系别」类条件（涂鸦 / 绝对秩序 / 流沙统治者）。
 * - 0.43.0 技能栏域 · 槽位限制：`legalActions` 读取 passive 覆盖 `battle.allowedSlots` 位掩码（bit0=1号位…），
 *          只列出允许槽位的技能（正位宝剑 / 宝剑王牌）。
 * - 0.44.0 队伍域 · 累计消耗能量计数 `energySpent`（`executeSkill` 自增，供「累计消耗恰好为 N」类，如整点报时）。
 * - 0.45.0 长尾能力：`randomizeSkill.sourceFrom`（候选池改为上下文点路径，如 `opponent.active.loadout`）；
 *          触发器 `energyGained`（`energy-modified` 增益级联 + 聚能派发）/ `charged`（`skill-charged` 级联）；
 *          计数 `bothFaints` / `usedElementKinds`（不同系别种数）；规则 `energy.noCap`（聚能不设上限）。
 * - 0.46.0 内容补齐第四期 D1：触发器 `heal`（`healed` 级联）/ `statusDamage`（`applyDamageCommands` 中
 *          状态来源 `dealDamage` 派发）；伤害事件带 `ownerType` / `ownerId`；派生计数 `hpLostQuarters`
 *          （受伤段）/ `teamMoe` / `fieldMarkKinds` / `fieldBuffKinds`（`refreshDerivedCounters`）。
 * - 0.47.0 内容补齐第四期 D2：规则键 `status.burnGrow` / `status.burnToPoison`（`settleStatus`，双方合并读）/
 *          `turnEnd.extra` / `turnEnd.skip`（`step` 回合末，任一侧声明对双方生效）/ `heal.redirectToDamage`（`heal`）。
 * - 0.48.0 内容补齐第四期 D3：`ActiveSprite.carryElements`（开局注入携带系别集合）；技能 `simple` tag
 *          （`buildBundle` 派生：无额外效果的攻击技能）；规则 `simple.powerMul`（`damageModifiers` 读取）。
 * - 0.49.0 内容补齐第四期 D4：`modifyStat.statFrom`（属性名取自上下文）；`copyStat`（复制对方增益 / 减益）；
 *          `inheritStat` 作为普通效果（`afterSwitch` 时把场下末位精灵的强化复制给换入精灵）。
 * - 0.50.0 内容补齐第四期 D5：`spreadEnergy`（为场下每只回复能量）；哨兵变量威力 / 逐段效果走
 *          `addPower.valueFrom` / `setHits` / `afterDamage` 组合（魔能爆 / 极寒领域 / 拆礼物 / 冰捆缚 / 打喷嚏…）。
 * - 0.51.0 增量长尾：`modifySkill.skillIdFrom`（技能 id 取自上下文，如相邻技能）；`spreadEnergy.deltaFrom`；
 *          行动视图 `action.neighborIds`（相邻技能 id）。服务联动装置 / 友谊之果 / 系统发育 / 重金属粉尘。
 * - 0.52.0 能耗域规则：`effectiveCost` 增可选 `rules` 参数，支持 `cost.signFlip`（对流：增减反转）/
 *          `cost.changeMul`（倾轧：变化幅度倍率）；`battle.ts` 各调用点传入 `ruleModifiers`。
 * - 0.53.0 增量长尾：`convertStatPolarity`（增益↔减益互转，掉包）；`healRedirect` 计数治疗改道（伪造账单，
 *          含溢出、回合末清除）；`actionDeclared` 的 `opponentAction` 补 `cost`（雪替身 / 听桥 / 冰天雪地）。
 * - 0.54.0 增量长尾：`randomizeSkill.sourceFrom` 增具名来源 `uncarried` / `team` / `opponent`（复写 / 借用 /
 *          取念）；规则 `cost.payWithHp`（盛宴 / 石头大餐：能量不足以 5% 最大生命代 1 点能耗，`legalActions` 同步放行）。
 * - 0.55.0 预警域：回合开始按对手携带攻击技能估算 `SideState.counters.incomingLethal`（`computeDamage` 取最大值
 *          对比自身生命，0/1，近似）；供预警 / 先知 / 哨兵。
 * - 0.56.0 血脉域（D9）：`StatProfile.bloodline`（培养资质输入，UI 已有选择器）→ `ActiveSprite.bloodline` /
 *          `bloodlineElement` 注入（系别名或 `leader` / `polluted` / `strange`）；`parseProfile` / `profileFromSetup` 透传。
 * - 0.57.0 防御共享冷却（术语 1016「应对攻击」）：使用防御技能后，携带的全部防御技能进入 1 回合冷却
 *          （本回合标记 touched，跨过回合末衰减，下一回合才恢复；壁垒 -1 / 火焰护盾 +1 等 modifyCooldown 叠加其上）。
 * - 0.58.0 萌化退化（D8）：图鉴精灵携带 `prev`（上一阶形态 id，`NORMALIZER_VERSION` n7→n8）；`applyStatus` 首次
 *          获得 `moe` → 换成 `prev` 并 `applyProfile` 重算 maxHp / hp 比例；`effectiveStat` 增加永久平铺加成
 *          `counters.flat-<stat>`（供「示弱」永久速度）。
 * - 0.59.0 迅捷（术语 1005，D6）：主动换人入场后，把换入精灵第一个能量足够且带 `quick` tag 的技能作为额外行动
 *          入队（照常拼速 + 参与 `actionDeclared` 应对判定）；技能 tag 派生抽为 `deriveSkillTags` 并在服务端装配注册
 *          图鉴后补跑（注册图鉴本身不含 tag）。模拟器另记侧计数器 `quickCostSum`（已用迅捷技能能耗累计），供
 *          「疾风连袭」动态能耗。
 * - 0.60.0 返场（术语 1024，D6）：新增 `returnField` 效果——回合末重新入场（重置 `actedSinceEntry` 触发迸发 +
 *          派发 `onEntry`；本回合入场者免疫）；`scheduleEffect.delay` 允许 0（当回合结算）。修复 `actionIdFor`
 *          忽略 `targetSide` 的缺陷（`cancelAction`/`forceFirst` 等 `target=opponent/target` 此前会错作用于自身，
 *          连带修正 硬门 / 摇篮曲 等打断类）。
 * - 0.61.0 迅捷族特性：迅捷判定支持规则覆盖授予（`quick.costBelow` / `quick.element.<系>` / `quick.slot1`），
 *          `orderKey` 支持 `quick.priorityBonus`（相争：迅捷技能先手 +N）。
 * - 0.62.0 使用次数 +1：`ActiveSprite.counters.extraUses` —— 消耗一个计数，本次技能行动额外执行一次
 *          （`executeSkill` 增 `payCost`，额外执行不重复耗能 / 不重设冷却）。
 * - 0.63.0 变身（D8）：新增 `transform`（换成指定精灵 `spriteId`，按比例重算 maxHp / hp）；`modifyEnergy.toMax`
 *          （回满能量）。
 * - 0.64.0 迅捷族续：`quick.first`（起飞加速 / 相争：本场首次使用技能永久迅捷，模拟器记 `firstQuick.<skill>`）+
 *          `quick.sharedWing`（飓风：队友翼系携带相同技能 → 迅捷）。
 * - 0.65.0 印记规则：`mark.consumeHalf`（守望星：触发星陨印记仅消耗一半层数，`consumed` 仍按满层结算伤害）。
 * - 0.66.0 蓄力 / 打断 / 元素链：`counters.noCharge`（免蓄力：跳过蓄力直接释放）+ 规则 `charge.any`（蓄力中可任选技能）；
 *          新触发器 `interrupt`（取消对手行动时派发，供威慑）；模拟器记元素链计数 `elChainIce` / `elChainFire`（大雪球 / 大火球）。
 * - 0.67.0 回合对比规则：`effectiveStat` 增永久百分比计数器 `pct-<stat>`（合拍）；回合末规则 `drainCostDiff`（石天平）/
 *          `harmony`（合拍）；伤害规则 `power.nonLight`（夺目：非光系威力 +N）。
 * - 0.68.0 能量 / 能耗规则：新增 `setEnergy`（盗魂铃初始 0）；规则 `cost.lastTurnSum`（基因编辑：基础能耗 = 上回合双方和）
 *          + `energy.gainReduce`（盗魂铃：回能 −N，作用于聚能与机制回能）。
 * - 0.69.0 结构族批量：`skillIdFrom` 扩展到 `learnSkill` / `rotateLoadout` / `modifySkillCost`；
 *          新增 `learnRandomSkills`（随机习得未携带技能）；`rotateLoadout` 记传动累计 `tractionTrack`。
 *          伤害结算应用 `pct-<stat>` / `flat-<stat>`（与 `effectiveStat` 同口径，修复合拍物防未入伤）。
 *          规则：`element.normalToWing`（展翅）/ `cost.wingAttack` + `lifesteal.wingAttack`（异类）/
 *          `charge.defenseMul`（游弋）/ `charge.skill.<id>`（龙守望：蓄力中可释放指定技能）/
 *          `cost.slotChangePenalty`（机械变式：回合内位移 → 能耗永久 −1）/ `switch.swapHpRatio`（瞳中倒影）/
 *          `wind.tractionPerMark`（风速仪：累计传动 → 风起印记）/ `power.vsPolluted`（天通地明）。
 *          换人门控读 `statuses.rooted`（禁足）。
 * - 0.70.0 血脉/日期族：修复 `cloneProfile` 丢失 `bloodline` / `stars`（血脉此前经克隆即失效）；
 *          常驻威力 / 连击计数器 `counters["power-add"]` / `["hits-add"]`（伤害结算读取、不消耗）；
 *          `BattleState.dayOfWeek`（未提供时按当前日期填充）+ 规则 `weekend.boost`（张弛有度：周末双攻 +40% /
 *          其余时间双防 +40%，模拟器按日写入 `pct-*`）。
 * - 0.71.0 选择再触发：使用「选择」技能后，规则 `choice.replayOther`（有求必应：追加另一分支）/
 *          `choice.replaySame`（一意孤行：追加相同分支）令模拟器以另一 / 相同 `choice` 重新派发 `beforeAction`
 *          并结算其状态 / 伤害（不重复耗能）。
 * - 0.72.0 复生域 + 规则值类型：`setRuleModifier` 允许字符串值（`RuleModifiers`）；`ActiveSprite.reviveDue` /
 *          `reviveAs` + 规则 `revive.afterTurns`（不朽：力竭 N 回合后于回合开始恢复满血重新可用）。
 */
export const ENGINE_VERSION = "0.72.0";
