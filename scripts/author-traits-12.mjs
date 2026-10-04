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
const ST = (id) => ({ path: "event.statusId", op: "eq", value: id });
const imm = (name, status) => ({ name: `${name}-免疫`, traitName: name, trigger: "statusApplied", when: [ST(status), SELF(name)], effects: [{ type: "removeStatus", target: "self", statusId: status }], note: `免疫${status}` });

const traits = [
  imm("茶多酚", "parasite"),
  imm("美拉德反应", "burn"),
  imm("吉利丁片", "freeze"),
  { name: "珊瑚骨", trigger: "afterSwitch", when: [TARGET("珊瑚骨")], effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: -3, mode: "add" }], note: "敌方离场 → 自己全技能能耗 −3" },
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
