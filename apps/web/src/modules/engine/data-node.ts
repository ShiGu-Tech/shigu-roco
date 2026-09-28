/** Node 侧数据加载：从磁盘读 data/*.json 组装 DataBundle。
 *
 * 仅用于服务端（Route Handler / 测试），Worker 与浏览器侧用 buildBundle + bundle。
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { DataError, buildBundle, REQUIRED_FILES } from "./data";
import type { DataBundle, Dict } from "./types";

function readJson<T = Dict>(file: string): T {
  try {
    return JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) as T;
  } catch (err) {
    throw new DataError(`读取 ${path.basename(file)} 失败: ${(err as Error).message}`);
  }
}

/** 从 cwd 逐级向上寻找含 data/sprites.json 的目录，支持 ROCO_DATA_DIR 覆盖。 */
export function resolveDataDir(): string {
  const env = process.env.ROCO_DATA_DIR;
  if (env && existsSync(/* turbopackIgnore: true */ path.join(env, "sprites.json"))) return env;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, "data");
    if (existsSync(/* turbopackIgnore: true */ path.join(cand, "sprites.json"))) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new DataError("未找到 data/ 目录（可用环境变量 ROCO_DATA_DIR 指定）");
}

export function loadData(dataDir?: string): DataBundle {
  const root = dataDir ?? resolveDataDir();
  const read = (name: string) => {
    const file = path.join(/* turbopackIgnore: true */ root, name);
    if (!existsSync(/* turbopackIgnore: true */ file)) throw new DataError(`缺少数据文件: ${file}`);
    return readJson(file);
  };
  const statsFile = path.join(/* turbopackIgnore: true */ root, "stats.json");
  const assetsFile = path.join(/* turbopackIgnore: true */ root, "assets.json");
  const mechanismsFile = path.join(/* turbopackIgnore: true */ root, "mechanisms.json");
  const raw = {
    sprites: read(REQUIRED_FILES.sprites),
    skills: read(REQUIRED_FILES.skills),
    marks: read(REQUIRED_FILES.marks),
    weather: read(REQUIRED_FILES.weather),
    elements: read(REQUIRED_FILES.elements),
    rules: read(REQUIRED_FILES.rules),
    stats: existsSync(/* turbopackIgnore: true */ statsFile) ? read("stats.json") : {},
    assets: existsSync(/* turbopackIgnore: true */ assetsFile) ? read("assets.json") : {},
    mechanisms: existsSync(/* turbopackIgnore: true */ mechanismsFile) ? readJson<unknown>(mechanismsFile) : [],
  };
  return buildBundle(raw);
}
