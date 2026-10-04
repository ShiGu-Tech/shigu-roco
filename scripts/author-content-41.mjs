// 第四期 · 使用次数 +1（电磁偏转 / 过载回路 / 噼啪！/ 噼啪噼啪！）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const n = sp.trait?.name;
  if (!n) continue;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(sp.id);
}

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;

// 电磁偏转：应对攻击成功 → 下回合所选技能使用次数 +1。
const spark = mechs.find((m) => m.id === "skill:sk-7110420:declare");
if (spark) {
  spark.effects = [
    { type: "forceFirst", target: "self" },
    { type: "applyStatus", target: "self", statusId: "def-7110420", layers: 1 },
    { type: "addCounter", target: "self", key: "extraUses", delta: 1 },
  ];
  spark.note = "电磁偏转：应对攻击成功 → 必定先手 + 本回合承伤 −70%；下回合所选技能使用次数 +1";
  patched++;
}

// 过载回路：回合末返场 + 下回合所选技能使用次数 +1。
const overload = mechs.find((m) => m.id === "skill:sk-7110360");
if (overload) {
  overload.effects = [
    { type: "scheduleEffect", target: "self", delay: 0, timing: "turnEnd", effects: [{ type: "returnField", target: "self" }, { type: "addCounter", target: "self", key: "extraUses", delta: 1 }] },
  ];
  overload.note = "过载回路：回合结束时返场 + 下回合所选技能使用次数 +1";
  patched++;
}

// 噼啪！/ 噼啪噼啪！：入场后首次行动所选技能使用次数 +1。
const traits = [
  { name: "噼啪！", effects: [{ type: "addCounter", target: "self", key: "extraUses", delta: 1 }], note: "入场后首次行动，所选技能使用次数 +1" },
  { name: "噼啪噼啪！", effects: [
    { type: "addCounter", target: "self", key: "extraUses", delta: 1 },
    { type: "unsupported", effectType: "actionRegen", reason: "该回合每次行动后回复 2 能量 待实现【待校准】" },
  ], note: "入场后首次行动，所选技能使用次数 +1（行动后回能待实现）" },
];
for (const { name, effects, note } of traits) {
  const ids = byName.get(name);
  if (!ids?.length) { console.log("  ! 未找到特性:", name); continue; }
  const full = { ownerType: "trait", ownerId: ids[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: ids }], effects, note: `特性「${name}」：${note}` };
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; continue; }
  let id = `trait:${ids[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${ids[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
}

console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
