/** G2b-1.5 AND 脊门控：把 `when` 的**合取链**上前置可判的叶提前精确求值——
 * 任一为假 ⇒ 整棵条件树必为假（AND 语义），直接跳过该机制的后续求值
 * （DSL 路径 = 省掉其余叶；程序路径 = **省掉整条链的图行走**，后者是 ~10x 性能差的主源）。
 *
 * 等价性：叶求值与 `conditionsMatch` 共用 `matchCondition` 同一实现，门控假 ⇒ `conditionsMatch` 必假
 * ⇒ 跳过是**纯短路提前**，零行为变化（两源同门控，A/B 等价保持）。
 *
 * 数据普查（695 条机制，2026-10-03）：682 条在 AND 脊上有身份叶（`value===ownerId` / 路径含 ownerId），
 * 13 条护盾 / `event.reacted` 规则的脊叶即其条件本身——全部可门控；`anyOf`（2 条）/ `not`（28 条）分支
 * 短路语义不保，不参与前置（其所在机制在脊上仍有其它可判叶时照常门控）。
 *
 * 代价模型：门控叶 ≈ 一次路径读 + 比较（作用域每批建一次），命中触发器但条件必不成立的机制
 * （beforeAction 单次 ~400/503 条）不再进入全量求值。
 */
import { matchCondition } from "./conditions";
import type { Condition, MechanismDefinition } from "./types";

/** 定义对象 → AND 脊叶（WeakMap；定义经 `mechanismsFromData` 后为稳定对象，跨批复用）。 */
const spineCache = new WeakMap<MechanismDefinition, Condition[]>();

/** 收集合取脊上的可判叶：顶层数组（AND）+ 嵌套 `allOf`；`anyOf` / `not` / `anyOf·not` 内的叶不可前置。 */
function collectSpine(conditions: Condition[] | undefined, out: Condition[]): void {
  if (!Array.isArray(conditions)) return;
  for (const item of conditions) {
    if (!item || typeof item !== "object") continue;
    if ("allOf" in item) {
      collectSpine(item.allOf, out);
      continue;
    }
    if ("path" in item) {
      out.push(item);
      continue;
    }
    // anyOf / not：真值表不保合取短路，不前置（仍由全量 conditionsMatch 判定）。
  }
}

/** 机制 AND 脊上的必判叶；空数组 = 不可门控，调用方全量求值（结果仍完全一致）。 */
export function gateLeavesFor(definition: MechanismDefinition): Condition[] {
  let leaves = spineCache.get(definition);
  if (!leaves) {
    leaves = [];
    collectSpine(definition.when, leaves);
    spineCache.set(definition, leaves);
  }
  return leaves;
}

/** 脊叶门控：任一叶为假 ⇒ 该机制条件必不成立，可跳过。`scope` 由 `conditionScope(context)`
 *  每批建一次（一次 collect 内全批复用）；返回 false 后的跳过是纯优化，结果与不门控逐位一致。 */
export function gatePasses(scope: unknown, definition: MechanismDefinition): boolean {
  const leaves = gateLeavesFor(definition);
  for (let i = 0; i < leaves.length; i++) {
    if (!matchCondition(scope, leaves[i])) return false;
  }
  return true;
}
