/** Node 侧数据加载：只读引擎参数（rules / stats / assets / mechanisms）。
 *
 * 精灵 / 技能 / 印记 / 天气 / 属性一律来自激活图鉴（现查，registry/catalogs/active），
 * 不存在 data/*.json 静态兜底。仅用于服务端（Route Handler / 测试）；
 * Worker 与浏览器侧用 buildBundle + bundle。
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { DataError, buildBundle } from "./data";
import type { DataBundle, Dict, RawDataFiles } from "./types";

function readJson<T = Dict>(file: string): T {
  try {
    return JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) as T;
  } catch (err) {
    throw new DataError(`读取 ${path.basename(file)} 失败: ${(err as Error).message}`);
  }
}

/** 从 cwd 逐级向上寻找含 data/rules.json 的目录，支持 ROCO_DATA_DIR 覆盖。 */
export function resolveDataDir(): string {
  const env = process.env.ROCO_DATA_DIR;
  if (env && existsSync(/* turbopackIgnore: true */ path.join(env, "rules.json"))) return env;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, "data");
    if (existsSync(/* turbopackIgnore: true */ path.join(cand, "rules.json"))) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new DataError("未找到 data/ 目录（可用环境变量 ROCO_DATA_DIR 指定）");
}

/** 只加载引擎参数，资源位留空——图鉴在 server.getBundle 装配。 */
export function loadData(dataDir?: string): DataBundle {
  const root = dataDir ?? resolveDataDir();
  const optional = (name: string, fallback: unknown): unknown => {
    const file = path.join(/* turbopackIgnore: true */ root, name);
    return existsSync(/* turbopackIgnore: true */ file) ? readJson<unknown>(file) : fallback;
  };
  const rulesFile = path.join(/* turbopackIgnore: true */ root, "rules.json");
  if (!existsSync(/* turbopackIgnore: true */ rulesFile)) throw new DataError(`缺少数据文件: ${rulesFile}`);

  const raw: RawDataFiles = {
    sprites: { sprites: [] },
    skills: { skills: [] },
    marks: { marks: [] },
    weather: { weather: [] },
    elements: {},
    rules: readJson(rulesFile),
    stats: optional("stats.json", {}) as Dict,
    assets: optional("assets.json", {}) as Dict,
    mechanisms: optional("mechanisms.json", []),
  };
  return buildBundle(raw);
}
