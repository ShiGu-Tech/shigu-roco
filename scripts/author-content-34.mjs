// 修正「技能机制未携带也触发」：给跨技能触发类技能机制补上身份 / 携带门。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const fixes = [
  // 能量刃：应仅在本技能自身应对成功时 +90（原来任意一次应对都会触发）。
  { id: "skill:sk-7020570", add: [{ path: "event.action.skillId", op: "eq", value: "sk-7020570" }] },
  // 蓄能轰击：只有携带本技能时才因「使用其他普通系技能」降耗（原来任何普通系技能都触发）。
  { id: "skill:sk-7020600", add: [{ path: "self.active.loadout", op: "contains", value: "sk-7020600" }] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0;
for (const { id, add } of fixes) {
  const m = mechs.find((x) => x.id === id);
  if (!m) { console.log("  ! 未找到机制:", id); continue; }
  const when = Array.isArray(m.when) ? m.when : [];
  let changed = false;
  for (const cond of add) {
    const key = JSON.stringify(cond);
    if (!when.some((c) => JSON.stringify(c) === key)) { when.push(cond); changed = true; }
  }
  m.when = when;
  if (changed) patched++;
}
console.log(`patch ${patched} 条`);
if (!patched) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
