import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 「应对防御：造成打断，且敌方下回合获得眩晕」：打断敌方行动 + 打 stun 计数器（下回合行动结算时跳过）。
const skills = [
  { id: "sk-7021160", name: "摇篮曲" },
  { id: "sk-7030270", name: "芳香诱引" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = skills.map((s) => ({
  id: `skill:${s.id}:counter`,
  ownerType: "skill",
  ownerId: s.id,
  trigger: "actionDeclared",
  when: [
    {
      allOf: [
        { path: "event.action.skillId", op: "eq", value: s.id },
        { path: "event.opponentAction.actionType", op: "eq", value: "Defense" },
      ],
    },
  ],
  effects: [
    { type: "forceFirst", target: "self" },
    { type: "cancelAction", target: "opponent" },
    { type: "addCounter", target: "opponent", key: "stun", delta: 1 },
  ],
  note: `${s.name}：应对防御成功 → 必定先手 + 打断被应对技能 + 敌方眩晕（下回合无法行动）`,
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
