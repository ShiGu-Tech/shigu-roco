/** 事件流 → 轨迹步（纯函数）：按 `data.trigger` 归桶，桶内机制带次数、效果去重。
 *
 * 跳过无 `trigger` 的引擎原生事件（换人 / 愿力 / 阵亡提示等——它们由阶段的触发器事件间接体现）；
 * `entry:<side>` / `scheduled` 为调度伪 id（入场继承队列 / 延迟效果），命中机制按原样计（点不进机制详情但计数有意义）。
 */

import type { AtlasAction, AtlasFired, AtlasStep, AtlasTrace } from "./types";

/** 与 `BattleEvent` 同形（引擎侧与 battle/types 两处定义一致，此处只依赖字段）。 */
interface EventLike {
  type: string;
  data?: Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** 聚合规则：保持触发器首次出现序；同触发器多桶（多侧 / 多次派发）合并为一桶并累计次数。 */
export function collectAtlasStep(input: { turn: number; actions: AtlasAction[]; log: EventLike[] }): AtlasStep {
  const order: string[] = [];
  const byTrigger = new Map<string, { mechanisms: Map<string, { count: number; effects: Set<string> }>; effects: Set<string> }>();

  for (const event of input.log) {
    const trigger = str(event.data?.trigger);
    if (!trigger) continue;
    let bucket = byTrigger.get(trigger);
    if (!bucket) {
      bucket = { mechanisms: new Map(), effects: new Set() };
      byTrigger.set(trigger, bucket);
      order.push(trigger);
    }
    const effectType = str(event.data?.effectType);
    if (effectType) bucket.effects.add(effectType);
    const mechanismId = str(event.data?.mechanismId);
    if (mechanismId) {
      let mech = bucket.mechanisms.get(mechanismId);
      if (!mech) {
        mech = { count: 0, effects: new Set() };
        bucket.mechanisms.set(mechanismId, mech);
      }
      mech.count += 1;
      if (effectType) mech.effects.add(effectType);
    }
  }

  const fired: AtlasFired[] = order.map((trigger) => {
    const bucket = byTrigger.get(trigger)!;
    return {
      trigger,
      mechanisms: [...bucket.mechanisms.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .map(([id, mech]) => ({ id, count: mech.count, effects: [...mech.effects].sort() })),
      effects: [...bucket.effects].sort(),
    };
  });

  return { turn: input.turn, actions: input.actions, fired };
}

// ---------------------------------------------------------------- 轨迹聚合

/** 把若干步按**发生顺序**展开为触发器序列（同触发器跨步重复保留，供回放逐个点亮）。 */
export function flattenFirings(steps: { fired: { trigger: string }[] }[]): string[] {
  return steps.flatMap((step) => step.fired.map((fired) => fired.trigger));
}

/** 触发器点亮数据（多步合并）。 */
export interface TriggerGlow {
  /** 命中过该触发器的步数。 */
  steps: number;
  /** 该触发器下各机制的累计命中次数。 */
  mechanisms: Map<string, number>;
  /** 该触发器下出现过的效果类型（去重）。 */
  effects: Set<string>;
}

/** 把整条轨迹合并为点亮视图：`trigger → TriggerGlow`（供全景图渲染）。 */
export function aggregateTrace(trace: AtlasTrace | null): Map<string, TriggerGlow> {
  const out = new Map<string, TriggerGlow>();
  if (!trace) return out;
  for (const step of trace.steps) {
    for (const bucket of step.fired) {
      let glow = out.get(bucket.trigger);
      if (!glow) {
        glow = { steps: 0, mechanisms: new Map(), effects: new Set() };
        out.set(bucket.trigger, glow);
      }
      glow.steps += 1;
      for (const mech of bucket.mechanisms) glow.mechanisms.set(mech.id, (glow.mechanisms.get(mech.id) ?? 0) + mech.count);
      for (const effect of bucket.effects) glow.effects.add(effect);
      // 机制级效果并入触发器级（防御：埋点版本差异）。
      for (const mech of bucket.mechanisms) for (const effect of mech.effects) glow.effects.add(effect);
    }
  }
  return out;
}
