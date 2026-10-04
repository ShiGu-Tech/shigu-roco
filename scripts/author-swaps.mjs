import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const skills = [
  { id: "sk-7180230", name: "恶念交换", effects: [{ type: "swap", target: "self", what: "hpRatio" }], note: "与敌方交换生命比例" },
  { id: "sk-7180200", name: "隐藏条款", effects: [{ type: "swap", target: "self", what: "skills" }], note: "与敌方交换携带的技能" },
  { id: "sk-7180180", name: "欺诈契约", effects: [{ type: "swap", target: "self", what: "stats" }], note: "与敌方交换增益和减益" },
  { id: "sk-7180440", name: "假冒", effects: [{ type: "setHpRatio", target: "self", from: "opponent" }], note: "生命比例设为与敌方相同（巧变 tag 待 C0）" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = skills.map((s) => ({
  id: `skill:${s.id}`,
  ownerType: "skill",
  ownerId: s.id,
  trigger: "beforeAction",
  when: [{ path: "event.action.skillId", op: "eq", value: s.id }],
  effects: s.effects,
  note: `${s.name}：${s.note}`,
}));
const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
if (toAdd.length === 0) { console.log("无新增"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
