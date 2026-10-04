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
const TARGET = (name) => ({ path: "target.active.spriteId", op: "in", value: byName.get(name) ?? [] });
const ELEM = (e) => ({ path: "event.element", op: "eq", value: e });

const traits = [
  // 星陨印记层数 → 威力
  { name: "观星", trigger: "beforeDamage", when: [SELF("观星"), ELEM("Earth")], effects: [{ type: "addPower", value: 0, valueFrom: { path: "target.active.marks.starfall-mark", scale: 20 } }], note: "敌方每层星陨 +20%" },
  { name: "坠星", trigger: "beforeDamage", when: [SELF("坠星")], effects: [{ type: "addPower", value: 0, valueFrom: { path: "target.active.marks.starfall-mark", scale: 20 } }], note: "敌方每层星陨 +20%" },
  // 增益 / 减益钩子
  { name: "王子的诺言", trigger: "buffGained", when: [SELF("王子的诺言")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -1, mode: "add" }], note: "获得增益 → 全技能能耗 −1" },
  { name: "王子的诺言-b", trigger: "debuffGained", when: [SELF("王子的诺言")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 1, mode: "add" }], note: "获得减益 → 全技能能耗 +1", traitName: "王子的诺言" },
  // 奉献类
  { name: "花精灵", trigger: "turnEnd", when: [SELF("花精灵")], effects: [{ type: "grantDedication", target: "self" }] },
  { name: "坚韧铠甲", trigger: "afterDamage", when: [TARGET("坚韧铠甲")], effects: [{ type: "grantDedication", target: "self" }], note: "受击 → 队伍 1 次随机奉献（self=攻击方，target 侧）" },
  { name: "扫拖一体", trigger: "turnEnd", when: [SELF("扫拖一体")], effects: [{ type: "removeMark", target: "opponent", layers: 1 }, { type: "grantDedication", target: "self" }] },
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
  const effects = t.name === "王子的诺言-b" ? t.effects : t.effects;
  generated.push({ id, ownerType: "trait", ownerId: sprites[0], trigger: t.trigger, when: t.when, effects, note: `特性「${t.traitName ?? t.name}」${t.note ? "：" + t.note : ""}` });
}

console.log(`生成 ${generated.length} 条`);
if (generated.length === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
