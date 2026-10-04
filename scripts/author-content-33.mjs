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

// D9 血脉（作为培养资质输入）。
const traits = [
  { name: "月光审判", def: { trigger: "beforeDamage", when: [{ path: "target.active.bloodline", op: "eq", value: "leader" }], effects: [{ type: "modifyDamage", target: "self", mode: "multiply", value: 2, scope: "outgoing" }], note: "攻击时若敌方血脉是首领血脉，威力 +100%" } },
  { name: "绒粉星光", def: { trigger: "beforeDamage", when: [
    { path: "target.active.bloodlineElement", op: "neq", value: "" },
    { not: { path: "target.active.element", op: "contains", valueFrom: "target.active.bloodlineElement" } },
  ], effects: [{ type: "modifyDamage", target: "self", mode: "multiply", value: 2, scope: "outgoing" }], note: "攻击时若敌方血脉是非本系的系别血脉，威力 +100%" } },
  { name: "“国王”的威严", def: { trigger: "beforeDamage", when: [SELF("“国王”的威严"), { path: "action.cost", op: "eq", value: 1 }], effects: [{ type: "modifyDamage", target: "self", mode: "multiply", value: 1.5, scope: "outgoing" }], note: "能耗为 1 的技能威力 +50%（种族资质增加略）" } },
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
