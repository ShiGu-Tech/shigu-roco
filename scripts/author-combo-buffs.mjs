import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 连击数 buff：addCounter self/opponent combo-add/combo-mul（runtime 伤害结算读取）。
const newSkills = [
  { id: "sk-7150140", name: "暴风眼", effects: [{ type: "addCounter", target: "self", key: "combo-mul", delta: 1 }], note: "获得连击数 +100%" },
  { id: "sk-7021050", name: "耀眼", effects: [{ type: "addCounter", target: "opponent", key: "combo-add", delta: -4 }], note: "敌方获得连击数 −4" },
  { id: "sk-7150410", name: "惊鸿一瞥", effects: [{ type: "addCounter", target: "self", key: "combo-add", delta: 1 }], note: "获得连击数 +1（迅捷 tag 待 C0）" },
  { id: "sk-7030270", name: "芳香诱引", effects: [{ type: "addCounter", target: "self", key: "combo-add", delta: 2 }], note: "获得连击数 +2（应对防御 打断+眩晕分支待 C0）" },
];

// 防御技：把原 unsupported(defenseCounter) 替换为连击数计数器。
const patchDeclare = [
  { id: "sk-7150310", name: "羽翼庇护", counter: [{ type: "addCounter", target: "self", key: "combo-add", delta: 2 }], note: "应对攻击 → 自己获得连击数 +2" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Map(file.mechanisms.map((m) => [m.id, m]));
const generated = newSkills.map((s) => ({
  id: `skill:${s.id}`,
  ownerType: "skill",
  ownerId: s.id,
  trigger: "beforeAction",
  when: [{ path: "event.action.skillId", op: "eq", value: s.id }],
  effects: s.effects,
  note: `${s.name}：${s.note}`,
}));
const toAdd = generated.filter((m) => !existing.has(m.id));

let patched = 0;
for (const p of patchDeclare) {
  const m = existing.get(`skill:${p.id}:declare`);
  if (!m) { console.log("  ! 未找到 declare:", p.id); continue; }
  m.effects = m.effects.filter((e) => e.type !== "unsupported");
  m.effects.push(...p.counter);
  m.note = `${p.name}：应对攻击成功 → 必定先手 + 本回合承伤减伤；${p.note}`;
  patched++;
}

console.log(`新增 ${toAdd.length} 条，替换 unsupported ${patched} 条`);
if (toAdd.length === 0 && patched === 0) { console.log("无改动"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
