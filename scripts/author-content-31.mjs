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

// 随机技能来源：复写 / 借用。
const skillDefs = [
  { id: "sk-7020860", sourceFrom: "uncarried", note: "复写：每回合随机变为未携带技能" },
  { id: "sk-7020840", sourceFrom: "team", note: "借用：每回合随机变为队友技能" },
];

// 生命代能 + 能耗。
const traitDefs = [
  { name: "盛宴", kind: "rule", key: "cost.payWithHp", value: true, note: "能量不足时以 5% 最大生命代替 1 点能耗" },
  { name: "石头大餐", kind: "rule", key: "cost.payWithHp", value: true, note: "能量不足时以 5% 生命代替 1 点能耗" },
  { name: "盲从", kind: "cost", note: "非幻系技能能耗 −2" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;

for (const { id, sourceFrom, note } of skillDefs) {
  const m = mechs.find((x) => x.id === `skill:${id}`) ?? mechs.find((x) => x.id.startsWith(`skill:${id}`) && x.effects.some((e) => e.type === "unsupported"));
  if (!m) { console.log("  ! 未找到技能占位:", id); continue; }
  m.trigger = "turnStart";
  m.when = [{ path: "self.active.loadout", op: "contains", value: id }];
  m.effects = [{ type: "randomizeSkill", target: "self", skillId: id, sourceFrom, duration: 0 }];
  m.note = note;
  patched++;
}

for (const { name, kind, key, value, note } of traitDefs) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  const effects = kind === "rule"
    ? [{ type: "setRuleModifier", target: "self", key, value }]
    : [{ type: "modifySkillCost", target: "self", scope: "all", excludeElements: ["Psychic"], delta: -2, duration: "permanent", key: "blind" }];
  const full = { ownerType: "trait", ownerId: sprites[0], trigger: "passive", when: [SELF(name)], effects, note: `特性「${name}」：${note}` };
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
