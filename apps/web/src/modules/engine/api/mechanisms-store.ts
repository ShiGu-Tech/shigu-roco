/** `data/mechanisms.json` 读写（工作台 G3b 写回；本地开发专用，线上只读）。
 *
 * - 文件信封：`{ $schemaVersion, version, updatedAt, mechanisms[] }`（2 空格缩进）。
 * - 原子写：先写同目录临时文件再 rename（同 catalog registry 惯例），避免半截文件。
 * - 写回时 `version` 推 patch、`updatedAt` 刷新；信封其余字段原样保留。
 * - 路径跟随 `resolveDataDir()`（`ROCO_DATA_DIR` 可重定向，供测试用临时目录）。
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveDataDir } from "../data-node";
import { toArray, type Dict } from "../types";
import { compileIssues } from "./compile-check";

export interface MechanismsFile {
  schemaVersion: string;
  version: string;
  updatedAt: string;
  mechanisms: Dict[];
}

export function mechanismsPath(): string {
  return path.join(resolveDataDir(), "mechanisms.json");
}

function asEntries(value: unknown): Dict[] {
  return Array.isArray(value) ? (value as Dict[]) : [];
}

export function readMechanismsFile(): MechanismsFile {
  const file = mechanismsPath();
  if (!existsSync(file)) return { schemaVersion: "0.1", version: "0.1.0", updatedAt: "", mechanisms: [] };
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (Array.isArray(raw)) return { schemaVersion: "0.1", version: "0.1.0", updatedAt: "", mechanisms: raw as Dict[] };
  const envelope = (raw ?? {}) as Dict;
  return {
    schemaVersion: typeof envelope.$schemaVersion === "string" ? envelope.$schemaVersion : "0.1",
    version: typeof envelope.version === "string" ? envelope.version : "0.1.0",
    updatedAt: typeof envelope.updatedAt === "string" ? envelope.updatedAt : "",
    mechanisms: asEntries(envelope.mechanisms),
  };
}

/** `x.y.z` → `x.y.(z+1)`；非语义版本原样返回（不猜格式）。 */
export function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return version;
  return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
}

export function writeMechanismsFile(next: MechanismsFile): string {
  const file = mechanismsPath();
  const temp = `${file}.tmp-${process.pid}`;
  const payload = {
    $schemaVersion: next.schemaVersion,
    version: next.version,
    updatedAt: next.updatedAt,
    mechanisms: next.mechanisms,
  };
  writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(temp, file);
  return file;
}

/** 工作台 · 写回：按 id 合并到磁盘文件（只覆盖变更项，文件里未提及的条目原样保留）。
 *  校验失败不落盘；无改动不落盘；`version` 推 patch + 刷新 `updatedAt`。仅本地（路由侧再 reload bundle）。 */
export function workbenchApply(body: Dict): Dict {
  if (process.env.NODE_ENV === "production") throw new Error("写回仅限本地开发（线上只读）");
  const draft = toArray<Dict>(body.mechanisms).filter((item) => typeof item.id === "string");
  const file = readMechanismsFile();
  const draftById = new Map(draft.map((item) => [String(item.id), item]));
  const diskIds = new Set(file.mechanisms.map((entry) => String(entry.id)));
  const errors: { level: string; node?: string; message: string }[] = [];
  for (const id of draftById.keys()) {
    if (!diskIds.has(id)) errors.push({ level: "error", message: `文件中不存在该机制 id（暂不支持新增机制）: ${id}` });
  }
  let changed = 0;
  const next = file.mechanisms.map((entry) => {
    const replacement = draftById.get(String(entry.id));
    if (!replacement || JSON.stringify(replacement) === JSON.stringify(entry)) return entry;
    changed += 1;
    errors.push(...compileIssues(replacement).filter((issue) => issue.level === "error"));
    return replacement;
  });
  if (errors.length) return { ok: false, errors, changed };
  if (changed === 0) return { ok: true, changed: 0, version: file.version, count: file.mechanisms.length }; // 无改动不落盘
  const version = bumpPatch(file.version);
  writeMechanismsFile({ ...file, version, updatedAt: new Date().toISOString(), mechanisms: next });
  return { ok: true, changed, version, count: next.length };
}
