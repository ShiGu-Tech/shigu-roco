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
const ENTER = (n) => ({ path: "event.enteredSpriteId", op: "in", value: byName.get(n) ?? [] });
const SKILL = (id) => ({ path: "action.skillId", op: "eq", value: id });

const traits = [
  { name: "友谊之果", defs: [{ trigger: "turnEnd", when: [SELF("友谊之果")], effects: [
    { type: "modifyEnergy", target: "self", delta: 1 },
    { type: "spreadEnergy", target: "self", delta: 1 },
    { type: "modifyEnergy", target: "opponent", delta: 1 },
    { type: "spreadEnergy", target: "opponent", delta: 1 },
  ], note: "回合结束时双方所有精灵回复 1 能量" }] },
  { name: "系统发育", defs: [{ trigger: "energyGained", when: [SELF("系统发育")], effects: [{ type: "spreadEnergy", target: "self", delta: 0, deltaFrom: { path: "event.value", round: "none" } }], note: "获得能量时将等量随机分配给场下（生命部分略）" }] },
];

const skills = [
  { id: "sk-7070070", defs: [
    { trigger: "actionResolved", when: [SKILL("sk-7070070")], effects: [
      { type: "modifySkill", target: "self", skillIdFrom: "action.neighborIds.0", power: 20 },
      { type: "modifySkill", target: "self", skillIdFrom: "action.neighborIds.1", power: 20 },
    ], note: "联动装置：使用后两侧技能威力永久 +20（应对防御 +30 略）" },
  ] },
  { id: "sk-7120290", defs: [
    { trigger: "actionResolved", when: [SKILL("sk-7120290")], effects: [{ type: "addCounter", target: "self", key: "dust", delta: 1 }], note: "重金属粉尘：获得「攻击附加中毒」效果" },
    { trigger: "beforeDamage", when: [{ path: "self.counters.dust", op: "gte", value: 1 }, { path: "action.category", op: "in", value: ["Physical", "Magic"] }], effects: [{ type: "applyStatus", target: "opponent", statusId: "poison", layers: 3 }], note: "重金属粉尘：攻击技能附加中毒 3" },
  ] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;

const addDef = (ownerType, ownerId, d, baseNote, ph) => {
  const full = { ownerType, ownerId, trigger: d.trigger, when: d.when, effects: d.effects, note: baseNote(d) };
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `${ownerType}:${ownerId}`, n = 2;
  while (mechs.some((m) => m.id === id)) id = `${ownerType}:${ownerId}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

for (const { name, defs } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  defs.forEach((d, i) => addDef("trait", sprites[0], d, (x) => `特性「${name}」：${x.note}`, i === 0 ? ph : null));
}

for (const { id, defs } of skills) {
  const ph = defs.length ? mechs.find((m) => m.id.startsWith(`skill:${id}`) && m.effects.some((e) => e.type === "unsupported")) : null;
  defs.forEach((d, i) => addDef("skill", id, d, (x) => x.note, i === 0 ? ph : null));
}

console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
