import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
const defs = [
  { skill: "sk-7020850", sourceFrom: "opponent.active.loadout", note: "取念：每回合随机变为敌方携带技能" },
  { skill: "sk-7020840", sourceFrom: "self.bench.0.loadout", note: "借用：每回合随机变为队友技能（取场下首只）" },
];
let patched = 0;
for (const { skill, sourceFrom, note } of defs) {
  const m = mechs.find((x) => x.id === `skill:${skill}` && x.effects.some((e) => e.type === "unsupported"));
  if (!m) { console.log("  ! 未找到技能机制:", skill); continue; }
  m.trigger = "turnStart";
  m.when = [{ path: "self.active.loadout", op: "contains", value: skill }];
  m.effects = [{ type: "randomizeSkill", target: "self", skillId: skill, sourceFrom, duration: 0 }];
  m.note = note;
  patched++;
}
console.log(`patch ${patched} 条`);
if (!patched) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
