#!/usr/bin/env node

/** 去重：删除「同一特性被登记两次」的冗余机制。
 *
 * 背景：早期「能耗域」批次为每个形态单独写了一条特性机制（如 `trait:sp-12-1` 缩壳）；
 * 后期 C4「内容补齐」批次又用 `trait:sp-12-1#2`（条件 `spriteId in [全部形态]`）重复登记同一特性，
 * 且未删旧条 → 同一精灵特性被减/加两次（板板壳「缩壳」防御技能能耗 3-2-2=0）。
 *
 * 本脚本删除这些冗余的 C4 副本，保留语义正确的基础条目；另修正「上锁」中
 * `trait:sp-379-1` 误覆盖 sp-380-1 导致的双减冷却。
 *
 * 用法：node scripts/dedupe-trait-mechanisms.mjs [--write] [--bump patch|minor|major]
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FILE = path.resolve("data/mechanisms.json");

// 冗余副本（每个精灵都有语义等价的基础条目，见 docs 说明）。
const REDUNDANT = [
  "trait:sp-8-1#2", // 浸润：保留 trait:sp-8-1/9-1/10-1
  "trait:sp-10-2#2", // 浪潮：保留 trait:sp-10-2
  "trait:sp-12-1#2", // 缩壳：保留 trait:sp-12-1/12-2/13-1/13-2/14-1/14-2
  "trait:sp-139-1#2", // 冰封：保留 trait:sp-139-1/140-1/141-1
  "trait:sp-142-1#2", // 捉迷藏：保留 trait:sp-142-1/143-1/144-1
  "trait:sp-159-1#2", // 思维之盾：保留 trait:sp-159-1/160-1/161-1
  "trait:sp-171-1#2", // 消波块：保留 trait:sp-171-1/171-2/172-1/172-2/173-1/173-2
  "trait:sp-373-1#2", // 盲从：保留 trait:sp-373-1/374-1
  "trait:sp-409-1#2", // 与星星同行：保留 trait:sp-409-1
  "trait:sp-4-3#3", // 草木苏醒时：保留 trait:sp-4-3#2
  "trait:sp-427-1", // 王子的诺言(buff)：保留 trait:sp-427-1:buff
  "trait:sp-427-1#2", // 王子的诺言(debuff)：保留 trait:sp-427-1:debuff
];

// 需要改写的条目（上锁：`trait:sp-379-1` 误覆盖 sp-380-1，与 `trait:sp-380-1` 叠加）。
const PATCH = {
  "trait:sp-379-1": [{ path: "self.active.spriteId", op: "eq", value: "sp-379-1" }],
};

function bumpPatch(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? "");
  if (!m) return v;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export function dedupe(file = FILE, { write = false, bump = "patch" } = {}) {
  const envelope = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(envelope) ? envelope : envelope.mechanisms;
  const before = list.length;
  const removed = [];
  const kept = list.filter((m) => {
    if (REDUNDANT.includes(m.id)) {
      removed.push(m.id);
      return false;
    }
    return true;
  });
  const byId = new Map(kept.map((m) => [m.id, m]));
  const patched = [];
  for (const [id, when] of Object.entries(PATCH)) {
    const m = byId.get(id);
    if (m && JSON.stringify(m.when) !== JSON.stringify(when)) {
      m.when = when;
      patched.push(id);
    }
  }
  const next = Array.isArray(envelope)
    ? kept
    : { ...envelope, version: bumpPatch(envelope.version), updatedAt: new Date().toISOString().slice(0, 10), mechanisms: kept };
  const missing = REDUNDANT.filter((id) => !removed.includes(id));
  const result = { before, after: kept.length, removed, patched, missing, version: next.version ?? null };
  if (write) {
    writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
    result.written = true;
  }
  return result;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const write = process.argv.includes("--write");
  const bumpArg = process.argv.indexOf("--bump");
  const bump = bumpArg >= 0 ? process.argv[bumpArg + 1] : "patch";
  const result = dedupe(FILE, { write, bump });
  console.log(JSON.stringify(result, null, 2));
  if (result.missing.length) {
    console.error("警告：以下冗余条目未找到:", result.missing.join(", "));
    process.exitCode = 1;
  }
}
