import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const traitByName = new Map();
const byName = new Map();
for (const sp of catalog.sprites) {
  const t = sp.trait;
  if (!t?.name) continue;
  if (!traitByName.has(t.name)) traitByName.set(t.name, t.desc ?? "");
  if (!byName.has(t.name)) byName.set(t.name, []);
  byName.get(t.name).push(sp.id);
}

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
// 已实现：从特性机制的 note「特性「X」」或既有 trait 机制反推名称。
const done = new Set();
for (const m of file.mechanisms) {
  if (m.ownerType !== "trait") continue;
  const match = /特性「(.+?)」/.exec(String(m.note ?? ""));
  if (match) done.add(match[1]);
}
// 早期手写的少量特性（无 note 前缀）按其说明匹配补齐。
for (const [name, desc] of traitByName) {
  if (done.has(name)) continue;
  if (file.mechanisms.some((m) => m.ownerType === "trait" && String(m.note ?? "").includes(desc.slice(0, 6)))) done.add(name);
}
// 明确已知已实现的（早期登记）。
for (const n of ["铃兰晚钟", "吟游之弦", "上锁"]) done.add(n);

const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const [name, sprites] of byName) {
  if (done.has(name)) continue;
  let id = `trait:${sprites[0]}`;
  let i = 2;
  while (existing.has(id) || generated.some((g) => g.id === id)) id = `trait:${sprites[0]}#${i++}`;
  generated.push({
    id,
    ownerType: "trait",
    ownerId: sprites[0],
    trigger: "passive",
    when: [],
    effects: [{ type: "unsupported", effectType: "traitEffect", reason: `${name}：${traitByName.get(name)}【待校准】` }],
    note: `特性「${name}」：待实现`,
  });
}

console.log(`已实现 ${done.size} 条；登记 unsupported ${generated.length} 条`);
if (generated.length === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
