import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const self = (stat, v) => ({ type: "modifyStat", target: "self", stat, mode: "percent", value: v });
const opp = (stat, v) => ({ type: "modifyStat", target: "opponent", stat, mode: "percent", value: v });
const flat = (target, stat, v) => ({ type: "modifyStat", target, stat, mode: "flat", value: v });

// base：beforeAction 常驻效果；counter：应对防御成功（actionDeclared + opponentAction==Defense）
const skills = [
  { id: "sk-7140290", name: "预备势", base: [self("atk", 80)], counter: [opp("defense", -80)] },
  { id: "sk-7140170", name: "气沉丹田", base: [{ type: "heal", target: "self", amount: 0.6, basis: "maxHp" }, self("atk", 130)] },
  { id: "sk-7140150", name: "破绽", base: [opp("defense", -70), opp("spdef", -70)], counter: [self("atk", 70)] },
  { id: "sk-7170280", name: "魔镜", base: [opp("spdef", -50), { type: "modifyEnergy", target: "opponent", delta: -3 }] },
  { id: "sk-7050230", name: "蓄水", base: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -6, mode: "add", duration: "nextAction" }] },
  { id: "sk-7021160", name: "摇篮曲", base: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 3, mode: "add" }], note: "应对防御分支（打断+眩晕）待 C0" },
  { id: "sk-7020730", name: "应激反应", base: [{ type: "heal", target: "self", amount: 0.25, basis: "maxHp" }], counter: [{ type: "heal", target: "self", amount: 0.25, basis: "maxHp" }], note: "应对防御额外回复，等效 50%" },
  {
    id: "sk-7040280",
    name: "充分燃烧",
    base: [
      { type: "scaleStatus", target: "opponent", statusId: "burn", factor: 2 },
      { type: "dealDamage", target: "opponent", category: "Passive", power: 0, basis: "maxHp", amount: 0.02, element: "Fire" },
    ],
  },
  { id: "sk-7021080", name: "三连破", base: [self("atk", 30)], note: "3 连击（能量技连击语义）待校准" },
  { id: "sk-7110410", name: "电离爆破", base: [opp("spatk", -20), flat("opponent", "speed", -20)], note: "2 连击待校准" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const s of skills) {
  generated.push({
    id: `skill:${s.id}`,
    ownerType: "skill",
    ownerId: s.id,
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: s.id }],
    effects: s.base,
    note: s.name + (s.note ? "：" + s.note : ""),
  });
  if (s.counter) {
    generated.push({
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
      effects: [{ type: "forceFirst", target: "self" }, ...s.counter],
      note: `${s.name}：应对防御成功 → 必定先手`,
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
