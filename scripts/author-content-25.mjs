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
const SELF = (n) => ({ path: "self.active.spriteId", op: "in", value: byName.get(n) ?? [] });
const TARGET = (n) => ({ path: "target.active.spriteId", op: "in", value: byName.get(n) ?? [] });

// D3 条件 / 派生值。
const traits = [
  { name: "偏振", def: { trigger: "beforeDamage", when: [TARGET("偏振"), { path: "target.active.carryElements", op: "contains", valueFrom: "event.element" }], effects: [{ type: "setDamageReduction", target: "target", percent: 40 }], note: "受到自己携带技能系别的攻击伤害 −40%" } },
  { name: "完全偏振", def: { trigger: "beforeDamage", when: [TARGET("完全偏振"), { path: "target.active.carryElements", op: "contains", valueFrom: "event.element" }], effects: [{ type: "setDamageReduction", target: "target", percent: 100 }], note: "抵抗自己携带技能系别的攻击伤害" } },
  { name: "不移", def: { trigger: "passive", when: [SELF("不移")], effects: [{ type: "setRuleModifier", target: "self", key: "simple.powerMul", value: 0.3 }], note: "携带的无额外效果的攻击技能威力 +30%" } },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, def } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  const full = { ownerType: "trait", ownerId: sprites[0], ...def, note: `特性「${name}」：${def.note}` };
  if (ph) { Object.assign(ph, full); patched++; continue; }
  let id = `trait:${sprites[0]}`, n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${sprites[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
}
console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
