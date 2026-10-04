// 第四期 D6 · 疾风连袭（迅捷汇总 + 动态能耗）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const def = {
  id: "skill:sk-7150320",
  ownerType: "skill",
  ownerId: "sk-7150320",
  trigger: "actionResolved",
  when: [{ path: "event.action.skillId", op: "eq", value: "sk-7150320" }],
  effects: [
    { type: "addCounter", target: "self", key: "galeUses", delta: 1 },
    { type: "modifySkillCost", target: "self", skillId: "sk-7150320", mode: "set", key: "gale-sum:7150320", deltaFrom: { path: "self.counters.quickCostSum", scale: 0.5 } },
    { type: "modifySkillCost", target: "self", skillId: "sk-7150320", mode: "set", key: "gale-uses:7150320", deltaFrom: { path: "self.active.counters.galeUses" } },
    { type: "unsupported", effectType: "recast", reason: "释放已用迅捷技能 待实现【待校准】" },
  ],
  note: "疾风连袭：能耗 = 已用迅捷技能能耗之和的一半 + 使用次数（释放迅捷技能待实现）",
};

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let removed = 0;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (mechs[i].id === def.id) { mechs.splice(i, 1); removed++; }
}
mechs.push(def);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
console.log(`remove ${removed} + upsert 1`);
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
