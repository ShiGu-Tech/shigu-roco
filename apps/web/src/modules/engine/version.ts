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
 */
export const ENGINE_VERSION = "0.5.0";
