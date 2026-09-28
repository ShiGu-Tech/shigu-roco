/** 可复现伪随机数：mulberry32。
 *
 * 替代 Python `random.Random(seed)`：跨语言数值流不同（无需逐值对拍），
 * 但「同 seed + 同输入 → 同输出」在本实现内成立。
 */

export class Rng {
  private state: number;

  constructor(seed = 42) {
    this.state = seed >>> 0;
  }

  /** 下一个 [0, 1) 浮点数。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [lo, hi) 均匀分布。 */
  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** 以概率 p 返回 true。 */
  bool(p: number): boolean {
    return this.next() < p;
  }

  /** [0, n) 整数。 */
  int(n: number): number {
    return Math.min(n - 1, Math.floor(this.next() * n));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** 按权重挑选；weights 之和 <= 0 时退化为均匀。 */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i] ?? 0);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
