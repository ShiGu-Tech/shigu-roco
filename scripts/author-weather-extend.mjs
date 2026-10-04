import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 汇流：雨天延长 4 回合；应对防御 → 再延长 4（共 8）。
const id = "sk-7050530";
const generated = [
  {
    id: `skill:${id}`,
    ownerType: "skill",
    ownerId: id,
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: id }],
    effects: [{ type: "modifyWeatherTurns", weatherId: "rain", delta: 4 }],
    note: "汇流：雨天回合数延长 4 回合",
  },
  {
    id: `skill:${id}:counter`,
    ownerType: "skill",
    ownerId: id,
    trigger: "actionDeclared",
    when: [
      {
        allOf: [
          { path: "event.action.skillId", op: "eq", value: id },
          { path: "event.opponentAction.actionType", op: "eq", value: "Defense" },
        ],
      },
    ],
    effects: [
      { type: "forceFirst", target: "self" },
      { type: "modifyWeatherTurns", weatherId: "rain", delta: 4 },
    ],
    note: "汇流：应对防御成功 → 必定先手 + 雨天再延长 4 回合（共 8）",
  },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
if (toAdd.length === 0) { console.log("无新增"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
