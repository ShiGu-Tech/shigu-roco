// 第四期 D8 · 萌化互动技能：示弱 / 赤子之心 / 反弹。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const removeIds = ["skill:sk-7160170", "skill:sk-7160180", "skill:sk-7160190"];

const additions = [
  {
    id: "skill:sk-7160170",
    ownerType: "skill",
    ownerId: "sk-7160170",
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7160170" }],
    effects: [
      { type: "applyStatus", target: "self", statusId: "moe", layers: 1 },
      { type: "addCounter", target: "self", key: "flat-speed", delta: 130 },
    ],
    note: "示弱：自己获得萌化（退化一阶）；速度永久 +130",
  },
  {
    id: "skill:sk-7160180",
    ownerType: "skill",
    ownerId: "sk-7160180",
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7160180" }],
    effects: [
      { type: "applyStatus", target: "self", statusId: "moe", layers: 1 },
      { type: "modifySkillCost", target: "self", scope: "all", delta: -2, duration: "permanent", key: "cherub:7160180", dispellable: false, hidden: false },
    ],
    note: "赤子之心：自己获得萌化（退化一阶）；全技能能耗永久 −2",
  },
  {
    id: "skill:sk-7160190",
    ownerType: "skill",
    ownerId: "sk-7160190",
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7160190" }],
    effects: [
      { type: "applyStatus", target: "opponent", statusId: "moe", layersFrom: { path: "self.active.statuses.moe" } },
      { type: "removeStatus", target: "self", statusId: "moe" },
    ],
    note: "反弹：把自己的萌化转移给敌方（近似：自身形态不回溯）",
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
