/** 精灵试验台适配表（数据驱动）：印记正 / 负面与上限、逐精灵例外、特性开关默认。
 *
 * 数据来自 `apps/web/public/data/lab-adapters.json`（唯一来源图鉴名称）；
 * 缺失时走通用默认（正面 / 负面印记各最多 1）。设计见《精灵试验台-适配与引擎接入-设计-v0.1》。
 */

export type MarkPolarity = "positive" | "negative";

export interface MarkAdapter {
  polarity: MarkPolarity;
  /** 该印记上限；缺省用通用（1）。 */
  max?: number;
}

export interface SpriteAdapter {
  marks?: { maxPositive?: number; maxNegative?: number; allowMultiple?: string[] };
  /** 可勾选触发的特性 key（沿用机制 ownerId，如 `trait:sp-1-1`）。 */
  traits?: string[];
  notes?: string;
}

export interface LabAdapters {
  version: string;
  updatedAt?: string;
  marks: Record<string, MarkAdapter>;
  sprites?: Record<string, SpriteAdapter>;
  traits?: Record<string, { toggle?: boolean; defaultTriggered?: boolean }>;
}

export const DEFAULT_MARK_MAX = 1;

export function emptyAdapters(): LabAdapters {
  return { version: "0", marks: {} };
}

/** 印记正 / 负面（无适配按正面）。 */
export function markPolarity(adapters: LabAdapters | null, markId: string): MarkPolarity {
  return adapters?.marks?.[markId]?.polarity ?? "positive";
}

export function polarityLabel(p: MarkPolarity): string {
  return p === "positive" ? "正面" : "负面";
}

/** 拉取适配表（静态包，失败回退空表）。 */
export async function loadAdapters(): Promise<LabAdapters> {
  try {
    const res = await fetch("/data/lab-adapters.json", { cache: "no-store" });
    if (res.ok) return (await res.json()) as LabAdapters;
  } catch {
    // 静态包不可用时回退默认
  }
  return emptyAdapters();
}
