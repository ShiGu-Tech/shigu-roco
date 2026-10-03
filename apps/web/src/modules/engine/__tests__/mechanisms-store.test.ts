import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workbenchValidate } from "../api/handlers";
import { bumpPatch, mechanismsPath, readMechanismsFile, workbenchApply, writeMechanismsFile } from "../api/mechanisms-store";
import type { Dict } from "../types";

/** 写回链路：临时 data 目录（ROCO_DATA_DIR 重定向）→ 读/写信封 → 按 id 合并 → 校验门。 */

interface SampleEntry {
  id: string;
  ownerType: string;
  ownerId: string;
  trigger: string;
  effects: Dict[];
}

interface Envelope {
  $schemaVersion: string;
  version: string;
  updatedAt: string;
  mechanisms: SampleEntry[];
}

const SAMPLE: Envelope = {
  $schemaVersion: "0.1",
  version: "0.34.0",
  updatedAt: "2026-10-01",
  mechanisms: [
    { id: "skill:sk-a", ownerType: "skill", ownerId: "sk-a", trigger: "beforeAction", effects: [{ type: "modifyEnergy", target: "self", delta: -3 }] },
    { id: "trait:t-b", ownerType: "trait", ownerId: "t-b", trigger: "turnEnd", effects: [{ type: "modifyMagic", target: "player", delta: 1 }] },
  ],
};

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "shigu-mech-"));
  writeFileSync(path.join(tempDir, "rules.json"), "{}", "utf8");
  writeFileSync(path.join(tempDir, "mechanisms.json"), JSON.stringify(SAMPLE, null, 2), "utf8");
  previousDataDir = process.env.ROCO_DATA_DIR;
  process.env.ROCO_DATA_DIR = tempDir;
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.ROCO_DATA_DIR;
  else process.env.ROCO_DATA_DIR = previousDataDir;
});

function readDisk(): Envelope {
  return JSON.parse(readFileSync(path.join(tempDir, "mechanisms.json"), "utf8")) as Envelope;
}

describe("mechanisms-store", () => {
  it("bumpPatch：语义版本推位，非版本原样", () => {
    expect(bumpPatch("0.34.0")).toBe("0.34.1");
    expect(bumpPatch("1.2.9")).toBe("1.2.10");
    expect(bumpPatch("abc")).toBe("abc");
  });

  it("读 → 写 保持信封结构（version 推位 + 2 空格缩进 + 结尾换行）", () => {
    const file = readMechanismsFile();
    expect(file.version).toBe("0.34.0");
    expect(file.mechanisms).toHaveLength(2);
    expect(mechanismsPath()).toBe(path.join(tempDir, "mechanisms.json"));

    writeMechanismsFile({ ...file, version: bumpPatch(file.version), updatedAt: "2026-10-03", mechanisms: file.mechanisms });
    const raw = readFileSync(path.join(tempDir, "mechanisms.json"), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain('\n  "mechanisms": ['); // 2 空格缩进
    const disk = readDisk();
    expect(disk.version).toBe("0.34.1");
    expect(disk.$schemaVersion).toBe("0.1");
    expect(disk.updatedAt).toBe("2026-10-03");
    expect(readMechanismsFile().mechanisms).toHaveLength(2);
  });
});

describe("workbench apply / validate API", () => {
  it("validate：合法定义零错误", () => {
    const result = workbenchValidate({ def: SAMPLE.mechanisms[0] });
    expect(result.errors).toEqual([]);
  });

  it("validate：写入缺必填参数 → error", () => {
    const result = workbenchValidate({ def: { id: "x", ownerType: "skill", ownerId: "x", trigger: "beforeAction", effects: [{ type: "dealDamage" }] } });
    expect((result.errors as unknown[]).length).toBeGreaterThan(0);
  });

  it("apply：按 id 合并变更，version 推 patch，未提及条目原样保留", () => {
    const draft = SAMPLE.mechanisms.map((entry) => (entry.id === "skill:sk-a" ? { ...entry, effects: [{ type: "modifyEnergy", target: "self", delta: -9 }] } : entry));
    const result = workbenchApply({ mechanisms: draft });
    expect(result).toMatchObject({ ok: true, changed: 1, version: "0.34.1" });
    const disk = readDisk();
    expect(disk.mechanisms[0].effects).toEqual([{ type: "modifyEnergy", target: "self", delta: -9 }]);
    expect(disk.mechanisms[1]).toEqual(SAMPLE.mechanisms[1]);
    expect(disk.version).toBe("0.34.1");
  });

  it("apply：草稿与磁盘一致 → changed 0 且不写盘", () => {
    const before = readFileSync(path.join(tempDir, "mechanisms.json"), "utf8");
    const result = workbenchApply({ mechanisms: SAMPLE.mechanisms });
    expect(result).toMatchObject({ ok: true, changed: 0, version: "0.34.0" });
    expect(readFileSync(path.join(tempDir, "mechanisms.json"), "utf8")).toBe(before);
  });

  it("apply：校验失败不落盘", () => {
    const before = readFileSync(path.join(tempDir, "mechanisms.json"), "utf8");
    const bad = SAMPLE.mechanisms.map((entry) => (entry.id === "skill:sk-a" ? { ...entry, effects: [{ type: "dealDamage" }] } : entry));
    const result = workbenchApply({ mechanisms: bad });
    expect(result.ok).toBe(false);
    expect((result.errors as unknown[]).length).toBeGreaterThan(0);
    expect(readFileSync(path.join(tempDir, "mechanisms.json"), "utf8")).toBe(before);
  });

  it("apply：文件中不存在的 id 拒绝（暂不支持新增机制）", () => {
    const result = workbenchApply({ mechanisms: [...SAMPLE.mechanisms, { id: "skill:new", ownerType: "skill", ownerId: "new", trigger: "turnEnd", effects: [] }] });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.errors)).toContain("不存在该机制");
  });

  it("apply：线上（production）只读", () => {
    const previous = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(() => workbenchApply({ mechanisms: SAMPLE.mechanisms })).toThrow("本地开发");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }
  });

  it("空文件：读取给出可诊断错误而不是静默当成空信封", () => {
    writeFileSync(path.join(tempDir, "mechanisms.json"), "", "utf8");
    // 空文件不是合法 JSON —— readMechanismsFile 应给出可诊断的错误而不是静默吞
    expect(() => readMechanismsFile()).toThrow();
    expect(existsSync(path.join(tempDir, "mechanisms.json"))).toBe(true);
  });
});
