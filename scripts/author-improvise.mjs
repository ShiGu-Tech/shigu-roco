import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const res = await fetch(`${API}/api/engine/catalog`);
const catalog = await res.json();
const skills = catalog.allSkills;

const ATTACK = new Set(["Physical", "Magic"]);

// 巧变：使用后变为指定范围内的随机技能且能耗 −1（用完还原）。
const targets = [
  { id: "sk-7120300", name: "毒肽", element: "Poison", category: "Status" },
  { id: "sk-7100320", name: "守护咒", element: "Dragon", category: "Status" },
  { id: "sk-7190430", name: "叠加态", element: "Psychic", category: "attack" },
  { id: "sk-7180440", name: "假冒", element: "Dark", category: "attack" },
  { id: "sk-7070290", name: "过山车", element: "Mechanic", category: "any" },
];

const elementsSeen = new Set(skills.map((s) => s.element));
const generated = [];
for (const t of targets) {
  const pool = skills
    .filter((s) => s.id !== t.id && s.element === t.element)
    .filter((s) => (t.category === "attack" ? ATTACK.has(s.category) : t.category === "any" ? true : s.category === t.category))
    .map((s) => s.id);
  if (!elementsSeen.has(t.element)) console.log(`  ! 元素不存在: ${t.element}`);
  console.log(`  ${t.name} ${t.id}: 池 ${pool.length} 条（${t.element}/${t.category}）`);
  if (!pool.length) continue;
  generated.push({
    id: `skill:${t.id}:improvise`,
    ownerType: "skill",
    ownerId: t.id,
    trigger: "skillUsed",
    when: [{ path: "event.skillId", op: "eq", value: t.id }],
    effects: [{ type: "randomizeSkill", target: "self", skillId: t.id, source: pool, costDelta: -1 }],
    note: `${t.name}：巧变 → 变为随机${t.element}${t.category}技能且能耗 −1，用完还原`,
  });
}

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
// 毒肽 / 守护咒：应对攻击无附加效果，去掉 C2 的 unsupported 占位。
let patched = 0;
for (const id of ["sk-7120300", "sk-7100320"]) {
  const m = file.mechanisms.find((x) => x.id === `skill:${id}:declare`);
  if (m && m.effects.some((e) => e.type === "unsupported")) {
    m.effects = m.effects.filter((e) => e.type !== "unsupported");
    patched++;
  }
}
const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`新增 ${toAdd.length} 条，清理 unsupported ${patched} 条`);
if (toAdd.length === 0 && patched === 0) { console.log("无改动"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
