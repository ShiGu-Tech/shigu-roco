#!/usr/bin/env node

/** 把服务端装配好的引擎数据（GET /api/engine/bundle）导出为入仓静态包。
 *
 * 产物：apps/web/public/data/bundle.json（浏览器 Worker 直接 fetch，~1MB）。
 * 前置：dev（或任意实例）在 26900 运行且已注册激活图鉴。
 * 通常由 scripts/sync-roco-world.mjs --register 自动调用，也可单独执行 `pnpm static:export`。
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ORIGIN = process.env.ROCO_ENGINE_URL ?? "http://localhost:26900";
export const OUTPUT_FILE = path.resolve("apps/web/public/data/bundle.json");

export async function exportStaticBundle(origin = ORIGIN) {
  const response = await fetch(`${origin}/api/engine/bundle`, { headers: { "cache-control": "no-store" } });
  if (!response.ok) throw new Error(`拉取引擎数据失败 ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const json = JSON.stringify(payload);
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, json, "utf8");
  return {
    file: OUTPUT_FILE,
    dataVersion: payload.dataVersion,
    updatedAt: payload.dataUpdatedAt,
    bytes: Buffer.byteLength(json),
    sprites: payload.sprites?.sprites?.length ?? 0,
    skills: payload.skills?.skills?.length ?? 0,
    mechanisms: payload.mechanisms?.length ?? 0,
  };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  exportStaticBundle()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
