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
const ELEM = (e) => ({ path: "event.element", op: "eq", value: e });

const traits = [
  { name: "冻土", trigger: "beforeDamage", when: [SELF("冻土"), ELEM("Earth")], effects: [{ type: "addPower", value: 0, valueFrom: { path: "self.active.loadout", count: { element: "Ice" }, scale: 10 } }], note: "每携带 1 个冰系技能，地系威力 +10%" },
  { name: "消波块", trigger: "beforeAction", when: [SELF("消波块")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", elements: ["Earth"], deltaFrom: { path: "self.active.loadout", count: { element: "Water" }, scale: -1 }, duration: "turns", turns: 1 }], note: "每携带 1 个水系技能，地系能耗 −1" },
  { name: "安眠", trigger: "battleStart", when: [SELF("安眠")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 2, mode: "add" }], note: "进入战斗全技能能耗 +2" },
  { name: "安眠-b", traitName: "安眠", trigger: "turnEnd", when: [SELF("安眠")], effects: [{ type: "heal", target: "self", amount: 0.05, basis: "maxHp" }, { type: "modifyEnergy", target: "self", delta: 1 }], note: "回合末回复 5% 生命 + 1 能量" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const t of traits) {
  const sprites = byName.get(t.traitName ?? t.name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", t.name); continue; }
  let id = `trait:${sprites[0]}`;
  let i = 2;
  while (existing.has(id) || generated.some((g) => g.id === id)) id = `trait:${sprites[0]}#${i++}`;
  generated.push({ id, ownerType: "trait", ownerId: sprites[0], trigger: t.trigger, when: t.when, effects: t.effects, note: `特性「${t.traitName ?? t.name}」${t.note ? "：" + t.note : ""}` });
}

console.log(`生成 ${generated.length} 条`);
if (generated.length === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
