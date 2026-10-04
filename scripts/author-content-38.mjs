// 第四期 D6/长尾 · 回合末返场：踏雷 / 过载回路。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const removeIds = ["skill:sk-7110460", "skill:sk-7110360"];

const additions = [
  {
    id: "skill:sk-7110460",
    ownerType: "skill",
    ownerId: "sk-7110460",
    trigger: "actionResolved",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7110460" }],
    effects: [
      { type: "scheduleEffect", target: "self", delay: 0, timing: "turnEnd", effects: [{ type: "returnField", target: "self" }] },
      { type: "unsupported", effectType: "burstCopy", reason: "携带攻击技能复制已触发迸发效果 待实现【待校准】" },
    ],
    note: "踏雷：回合结束时返场（迸发效果复制待实现）",
  },
  {
    id: "skill:sk-7110360",
    ownerType: "skill",
    ownerId: "sk-7110360",
    trigger: "actionResolved",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7110360" }],
    effects: [
      { type: "scheduleEffect", target: "self", delay: 0, timing: "turnEnd", effects: [{ type: "returnField", target: "self" }] },
      { type: "unsupported", effectType: "extraUses", reason: "下回合所选技能使用次数 +1 待实现【待校准】" },
    ],
    note: "过载回路：回合结束时返场（使用次数 +1 待实现）",
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
