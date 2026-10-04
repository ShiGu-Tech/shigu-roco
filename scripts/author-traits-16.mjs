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
const DEAD = (n) => ({ path: "event.spriteId", op: "in", value: byName.get(n) ?? [] });

// P2 生命 / 致命：伤害免疫（减伤 100%）/ 受击反伤 / 致命拦截（不倒）。
const defs = [
  { name: "惊吓", defs: [{ trigger: "beforeDamage", when: [TARGET("惊吓"), { path: "self.active.energy", op: "eq", value: 0 }], effects: [{ type: "setDamageReduction", target: "target", percent: 100 }], note: "能量为 0 的精灵无法对自己造成伤害" }] },
  { name: "逐魂鸟", defs: [{ trigger: "beforeDamage", when: [TARGET("逐魂鸟"), { path: "action.cost", op: "lte", value: 1 }, { path: "action.category", op: "in", value: ["Physical", "Magic"] }], effects: [{ type: "setDamageReduction", target: "target", percent: 100 }], note: "能耗 ≤1 的攻击技能无法对自己造成伤害" }] },
  { name: "保守派", defs: [{ trigger: "beforeDamage", when: [TARGET("保守派"), { path: "target.counters.loadoutCost", op: "lt", value: 4 }], effects: [{ type: "setDamageReduction", target: "target", percent: 80 }], note: "总技能能耗 <4 时承伤 −80%（近似双防 +80%）" }] },
  { name: "刺肤", defs: [{ trigger: "onHit", when: [TARGET("刺肤"), { path: "event.damageType", op: "in", value: ["Physical", "Magic"] }], effects: [{ type: "dealDamage", target: "self", category: "Physical", power: 50 }], note: "每受攻击伤害，对攻击者造成 50 威力物伤" }] },
  { name: "不死鸟", defs: [{ trigger: "beforeFatal", when: [DEAD("不死鸟"), { path: "self.counters.phoenix", op: "neq", value: 1 }], effects: [
    { type: "heal", target: "self", amount: 1 },
    { type: "addCounter", target: "self", key: "phoenix", delta: 1 },
    { type: "applyStatus", target: "opponent", statusId: "burn", layers: 15 },
  ], note: "每场 1 次，致命伤害保留 1 血，敌方获 15 层灼烧" }] },
  { name: "化茧", defs: [{ trigger: "beforeFatal", when: [DEAD("化茧"), { path: "self.counters.cocoon", op: "neq", value: 2 }], effects: [
    { type: "heal", target: "self", amount: 1 },
    { type: "addCounter", target: "self", key: "cocoon", delta: 1 },
    { type: "applyStatus", target: "self", statusId: "moe", layers: 1 },
  ], note: "致命伤害时获 1 层萌化并免疫（最多 2 次）" }] },
  { name: "星地善良", defs: [{ trigger: "turnEnd", when: [SELF("星地善良"), { path: "self.active.energy", op: "eq", value: 0 }], effects: [{ type: "forceSwitch", target: "self" }], note: "回合末若在场精灵能量为 0，强制替换" }] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
const existing = new Set(mechs.map((m) => m.id));
let patched = 0, added = 0;
for (const { name, defs: list } of defs) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  let baseId = `trait:${sprites[0]}`;
  list.forEach((d, i) => {
    const def = { ownerType: "trait", ownerId: sprites[0], trigger: d.trigger, when: d.when, effects: d.effects, note: `特性「${name}」：${d.note}` };
    if (i === 0 && ph) { Object.assign(ph, def); patched++; return; }
    let id = baseId, n = 2;
    while (existing.has(id) || mechs.some((m) => m.id === id)) id = `${baseId}#${n++}`;
    mechs.push({ id, ...def }); existing.add(id); added++;
  });
}
console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
