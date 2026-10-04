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
const COST = (op, v) => ({ path: "action.cost", op, value: v });

const traits = [
  { name: "挺起胸脯", trigger: "beforeDamage", when: [SELF("挺起胸脯"), COST("eq", 1)], effects: [{ type: "modifyDamage", mode: "multiply", value: 1.5, scope: "outgoing" }] },
  { name: "勇敢", trigger: "beforeDamage", when: [SELF("勇敢"), COST("gt", 3)], effects: [{ type: "modifyDamage", mode: "multiply", value: 1.4, scope: "outgoing" }] },
  { name: "缩壳", trigger: "beforeAction", when: [SELF("缩壳"), { path: "action.category", op: "eq", value: "Defense" }], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, mode: "add", duration: "nextAction" }] },
  { name: "快充", trigger: "beforeSwitch", when: [SELF("快充")], effects: [{ type: "modifyEnergy", target: "self", delta: 10 }] },
  { name: "灵魂灼伤", trigger: "skillUsed", when: [SELF("灵魂灼伤"), ELEM("Ice")], effects: [{ type: "applyStatus", target: "opponent", statusId: "burn", layers: 4, immuneElements: ["Fire"] }] },
  { name: "灵魂灼伤-b", traitName: "灵魂灼伤", trigger: "skillUsed", when: [SELF("灵魂灼伤"), ELEM("Fire")], effects: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 2, immuneElements: ["Ice"] }], note: "火系 → 敌方冻结" },
  { name: "爆裂玉米", trigger: "skillUsed", when: [SELF("爆裂玉米"), ELEM("Grass")], effects: [{ type: "applyStatus", target: "opponent", statusId: "burn", layers: 4, immuneElements: ["Fire"] }] },
  { name: "爆裂玉米-b", traitName: "爆裂玉米", trigger: "skillUsed", when: [SELF("爆裂玉米"), ELEM("Fire")], effects: [{ type: "applyStatus", target: "opponent", statusId: "parasite", layers: 1, immuneElements: ["Grass"] }], note: "火系 → 敌方寄生" },
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
