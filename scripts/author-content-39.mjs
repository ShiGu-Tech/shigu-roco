// 第四期长尾 · 龙守望（选择：能耗-1 / 应对防御打断眩晕）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const removeIds = ["skill:sk-7100300"];

const additions = [
  {
    id: "skill:sk-7100300:light",
    ownerType: "skill",
    ownerId: "sk-7100300",
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7100300" }, { path: "event.action.choice", op: "neq", value: 1 }],
    effects: [{ type: "modifySkillCost", target: "self", skillId: "sk-7100300", delta: -1, duration: "nextAction", key: "dragonwatch:light" }],
    note: "龙守望：选择·明（本次能耗 −1）",
  },
  {
    id: "skill:sk-7100300:dark",
    ownerType: "skill",
    ownerId: "sk-7100300",
    trigger: "actionDeclared",
    when: [
      { path: "event.action.skillId", op: "eq", value: "sk-7100300" },
      { path: "event.action.choice", op: "eq", value: 1 },
      { path: "event.opponentAction.actionType", op: "eq", value: "Defense" },
    ],
    effects: [
      { type: "forceFirst", target: "self" },
      { type: "cancelAction", target: "opponent" },
      { type: "addCounter", target: "opponent", key: "stun", delta: 1 },
    ],
    note: "龙守望：选择·暗（应对防御 → 打断 + 敌方下回合眩晕）",
  },
  {
    id: "skill:sk-7100300:charge",
    ownerType: "skill",
    ownerId: "sk-7100300",
    trigger: "passive",
    when: [],
    effects: [{ type: "unsupported", effectType: "chargeSkip", reason: "下次技能无需蓄力 / 蓄力中可释放 待实现【待校准】" }],
    note: "龙守望：蓄力交互待实现",
  },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let removed = 0;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (removeIds.includes(mechs[i].id)) { mechs.splice(i, 1); removed++; }
}
let added = 0;
for (const def of additions) {
  if (mechs.some((m) => m.id === def.id)) continue;
  mechs.push(def); added++;
}
console.log(`remove ${removed}，add ${added}`);
if (!removed && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
