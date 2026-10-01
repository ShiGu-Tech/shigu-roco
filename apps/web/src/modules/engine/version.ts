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
 */
export const ENGINE_VERSION = "0.1.0";
