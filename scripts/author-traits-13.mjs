import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const name = sp.trait?.name;
  if (!name) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(sp.id);
}
const SELF = (name) => ({ path: "self.active.spriteId", op: "in", value: byName.get(name) ?? [] });

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));

// 淬火 / 暖气：把 unsupported 应对分支替换为「下一次攻击」计数器。
let patched = 0;
for (const [id, counter] of [
  ["sk-7040450", { type: "addCounter", target: "self", key: "next-damage-mul", delta: 1 }],
  ["sk-7040640", { type: "addCounter", target: "self", key: "next-power-add", delta: 50 }],
]) {
  const m = file.mechanisms.find((x) => x.id === `skill:${id}:declare`);
  if (m && m.effects.some((e) => e.type === "unsupported")) {
    m.effects = m.effects.filter((e) => e.type !== "unsupported");
    m.effects.push(counter);
    patched++;
  }
}

// 特性：应对成功后下次攻击威力翻倍。
const traits = [{ name: "圣火骑士", trigger: "skillUsed", when: [SELF("圣火骑士"), { path: "event.reacted", op: "eq", value: true }], effects: [{ type: "addCounter", target: "self", key: "next-damage-mul", delta: 1 }] }];
const generated = [];
for (const t of traits) {
  const sprites = byName.get(t.name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", t.name); continue; }
  let id = `trait:${sprites[0]}`;
  let i = 2;
  while (existing.has(id) || generated.some((g) => g.id === id)) id = `trait:${sprites[0]}#${i++}`;
  generated.push({ id, ownerType: "trait", ownerId: sprites[0], trigger: t.trigger, when: t.when, effects: t.effects, note: `特性「${t.name}」` });
}

console.log(`新增 ${generated.length} 条，补丁 ${patched} 条`);
if (generated.length === 0 && patched === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
