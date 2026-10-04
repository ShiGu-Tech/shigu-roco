import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const C0 = { path: "event.action.choice", op: "neq", value: 1 }; // 明（含缺省）
const C1 = { path: "event.action.choice", op: "eq", value: 1 }; // 暗
const sid = (id) => ({ path: "event.action.skillId", op: "eq", value: id });

// 每个技能：base（常驻，可选）+ 两个选择分支。
const skills = [
  {
    id: "sk-7040660",
    name: "野火",
    choices: [
      [{ type: "applyStatus", target: "opponent", statusId: "burn", layers: 7, immuneElements: ["Fire"] }],
      [{ type: "modifyStat", target: "opponent", stat: "defense", mode: "percent", value: -90 }],
    ],
  },
  {
    id: "sk-7030600",
    name: "补觉",
    choices: [
      [{ type: "heal", target: "self", amount: 0.25, basis: "maxHp" }],
      [{ type: "modifyEnergy", target: "self", delta: 8 }],
    ],
  },
  {
    id: "sk-7070210",
    name: "蒸汽进行曲",
    choices: [
      [{ type: "modifyStat", target: "self", stat: "speed", mode: "flat", value: 60 }],
      [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 90 }],
    ],
  },
  {
    id: "sk-7080460",
    name: "沙石阵",
    base: [{ type: "modifyStat", target: "self", stat: "speed", mode: "flat", value: -20 }],
    choices: [
      [{ type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 90 }],
      [{ type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 90 }],
    ],
  },
  {
    id: "sk-7140330",
    name: "马步",
    choices: [
      [
        { allOf: [{ path: "self.active.hp", op: "lt", valueFrom: { path: "self.active.maxHp", scale: 0.2 } }] },
      ],
      [],
    ],
    choiceEffects: [
      [{ type: "heal", target: "self", amount: 0.6, basis: "maxHp" }],
      [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 150 }],
    ],
    choiceConds: [
      { path: "self.active.hp", op: "lt", valueFrom: { path: "self.active.maxHp", scale: 0.2 } },
      { path: "self.active.hp", op: "gt", valueFrom: { path: "self.active.maxHp", scale: 0.8 } },
    ],
  },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const s of skills) {
  if (s.base) {
    generated.push({
      id: `skill:${s.id}`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "beforeAction",
      when: [sid(s.id)],
      effects: s.base,
      note: `${s.name}：常驻效果`,
    });
  }
  const choiceEffects = s.choiceEffects ?? s.choices;
  for (let i = 0; i < 2; i++) {
    const cond = [sid(s.id), i === 0 ? C0 : C1];
    if (s.choiceConds) cond.push(s.choiceConds[i]);
    generated.push({
      id: `skill:${s.id}:${i === 0 ? "light" : "dark"}`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "beforeAction",
      when: cond,
      effects: choiceEffects[i],
      note: `${s.name}：选择·${i === 0 ? "明" : "暗"}`,
    });
  }
}

const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
if (toAdd.length === 0) { console.log("无新增"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
