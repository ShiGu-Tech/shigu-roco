/** 贝叶斯对手模型：Dirichlet–Multinomial，估计对手 A/D/S 动作分布。
 *  对应 Python opponent/bayes.py。
 */

import type { Rng } from "../rng";

export const CLASSES = ["A", "D", "S"] as const;
export type ActionClass = (typeof CLASSES)[number];

export class OpponentModel {
  alpha: number[];
  counts: number[];

  constructor(alpha: number[] = [1, 1, 1], counts: number[] = [0, 0, 0]) {
    this.alpha = [...alpha];
    this.counts = [...counts];
  }

  observe(actionClass: string): void {
    const idx = CLASSES.indexOf(actionClass as ActionClass);
    if (idx >= 0) this.counts[idx] += 1;
  }

  probabilities(): Record<ActionClass, number> {
    const totals = this.alpha.map((a, i) => a + this.counts[i]);
    const sum = totals.reduce((s, v) => s + v, 0) || 1;
    return { A: totals[0] / sum, D: totals[1] / sum, S: totals[2] / sum };
  }

  sampleClass(rng: Rng): ActionClass {
    const probs = this.probabilities();
    const r = rng.next();
    let acc = 0;
    for (const cls of CLASSES) {
      acc += probs[cls];
      if (r <= acc) return cls;
    }
    return CLASSES[CLASSES.length - 1];
  }

  /** 允许传入先验 α 或历史计数；按计数处理（>0 的整数）。 */
  static fromDict(raw: Record<string, number> | null | undefined): OpponentModel {
    if (!raw) return new OpponentModel();
    const counts = CLASSES.map((c) => Math.max(0, Math.floor(Number(raw[c] ?? 0) || 0)));
    return new OpponentModel([1, 1, 1], counts);
  }

  toDict(): Record<ActionClass, number> {
    return this.probabilities();
  }
}
