#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const index = JSON.parse(await readFile(path.join(root, "data/registry/catalogs/index.json"), "utf8"));
const activeId = index.activeRegistrationId;
if (!activeId) throw new Error("没有激活图鉴");

const catalog = JSON.parse(await readFile(path.join(root, "data/registry/catalogs", activeId, "catalog.json"), "utf8"));
const outputRoot = path.join(root, "apps/web/public/images/catalog");
const concurrency = 12;

function localFile(kind, id) {
  return path.join(outputRoot, kind, `${id}.webp`);
}

async function download(item) {
  const target = localFile(item.kind, item.id);
  try {
    const response = await fetch(item.url, { headers: { "user-agent": "shigu-rock-assets/1.0" } });
    if (!response.ok) throw new Error(`${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    return true;
  } catch (error) {
    console.warn(`下载失败 ${item.kind}/${item.id}: ${item.url} (${error instanceof Error ? error.message : error})`);
    return false;
  }
}

const items = [];
for (const sprite of catalog.sprites ?? []) {
  if (sprite.image) items.push({ kind: "sprites", id: sprite.id, url: sprite.image });
  if (sprite.head) items.push({ kind: "heads", id: sprite.id, url: sprite.head });
}
for (const skill of catalog.skills ?? []) {
  if (skill.icon) items.push({ kind: "skills", id: skill.id, url: skill.icon });
}

await mkdir(path.join(outputRoot, "sprites"), { recursive: true });
await mkdir(path.join(outputRoot, "heads"), { recursive: true });
await mkdir(path.join(outputRoot, "skills"), { recursive: true });

let cursor = 0;
let succeeded = 0;
async function worker() {
  while (cursor < items.length) {
    const item = items[cursor++];
    if (await download(item)) succeeded += 1;
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

console.log(JSON.stringify({ activeId, total: items.length, downloaded: succeeded, failed: items.length - succeeded, output: "apps/web/public/images/catalog" }, null, 2));
