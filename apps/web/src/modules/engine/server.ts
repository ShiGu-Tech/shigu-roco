/** 服务端数据缓存（仅 Node runtime 使用）。 */

import { loadData } from "./data-node";
import type { DataBundle } from "./types";

let cached: DataBundle | null = null;

export function getBundle(force = false): DataBundle {
  if (force || !cached) cached = loadData();
  return cached;
}

export function reloadBundle(): DataBundle {
  cached = loadData();
  return cached;
}
