import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const P = (stat, v) => ({ type: "modifyStat", target: "self", stat, mode: "percent", value: v });
const PO = (stat, v) => ({ type: "modifyStat", target: "opponent", stat, mode: "percent", value: v });

const skills = [
  { id: "sk-7020680", name: "锐利眼神", effects: [PO("defense", -120), PO("spdef", -120)] },
  { id: "sk-7021030", name: "加固", effects: [P("defense", 140)] },
  { id: "sk-7050220", name: "润泽", effects: [P("spatk", 190)] },
  { id: "sk-7090390", name: "霜冻", effects: [PO("spdef", -100)] },
  { id: "sk-7090300", name: "雪球", effects: [{ type: "modifyStat", target: "opponent", stat: "speed", mode: "flat", value: -90 }] },
  { id: "sk-7190480", name: "仰望夜空", effects: [P("spatk", 70), P("spdef", 70)] },
  {
    id: "sk-7021280",
    name: "缓一缓",
    effects: [
      { type: "modifyEnergy", target: "self", delta: 1 },
      { type: "heal", target: "self", amount: 0.1, basis: "maxHp" },
      P("spatk", 10),
      P("spdef", 10),
      P("speed", 10),
    ],
  },
  { id: "sk-7020710", name: "主场优势", effects: [{ type: "applyMark", target: "self", markId: "attack-mark", layers: 1 }] },
  { id: "sk-7120240", name: "疫病吐息", effects: [{ type: "applyMark", target: "opponent", markId: "poison-mark", layers: 1 }] },
  { id: "sk-7020740", name: "棘刺", effects: [{ type: "applyMark", target: "opponent", markId: "thorn-mark", layers: 1 }] },
  { id: "sk-7050240", name: "打湿", effects: [{ type: "applyMark", target: "self", markId: "wet-mark", layers: 1 }] },
  { id: "sk-7110260", name: "增程电池", effects: [{ type: "applyMark", target: "self", markId: "electric-charge-mark", layers: 1 }] },
  { id: "sk-7090330", name: "速冻", effects: [{ type: "applyMark", target: "opponent", markId: "slow-mark", layers: 2 }] },
  { id: "sk-7100240", name: "龙威", effects: [{ type: "applyMark", target: "self", markId: "dragon-devour-mark", layers: 1 }] },
  { id: "sk-7160380", name: "加油", effects: [{ type: "applyMark", target: "self", markId: "sprout-mark", layers: 1 }] },
  { id: "sk-7180390", name: "纺纱", effects: [{ type: "applyMark", target: "opponent", markId: "undertow-mark", layers: 1 }] },
  { id: "sk-7110440", name: "惊雷", effects: [{ type: "changeWeather", weatherId: "thunder", turns: 8 }] },
  { id: "sk-7090370", name: "冬至", effects: [{ type: "changeWeather", weatherId: "blizzard", turns: 8 }] },
  { id: "sk-7020760", name: "精神扰乱", effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 1, mode: "add" }], note: "应对防御分支（+3）待补" },
  { id: "sk-7050410", name: "盐水浴", effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, mode: "add" }], note: "应对防御分支（−3）待补" },
  { id: "sk-7090170", name: "瞬间零度", effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 3, mode: "add", duration: "turns", turns: 1 }], note: "应对防御分支待补" },
  {
    id: "sk-7030290",
    name: "移花接木",
    effects: [
      { type: "heal", target: "self", amount: 0.15, basis: "maxHp" },
      { type: "escape", target: "self" },
    ],
  },
  { id: "sk-7110370", name: "远程访问", effects: [{ type: "forceSwitch", target: "opponent" }] },
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
  note: `${s.name}${s.note ? "：" + s.note : ""}`,
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
