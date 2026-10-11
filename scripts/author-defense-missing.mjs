/** 补：视频A对拍用到的防御技（水泡盾/吓退/报复/硬化），按 author-defense-skills.mjs 同范式。
 *  幂等追加 skill:<id>:declare/:reduce/:expire。`--write` 落盘。 */
import fs from "node:fs";
const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const shieldKey = (id) => "def-" + id.replace(/^sk-/, "");

// reduce% + 应对攻击附加效果
const skills = [
  { id: "sk-7050270", name: "水泡盾", reduce: 80, counter: [{ type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 70 }], counterNote: "自己魔攻 +70%" },
  { id: "sk-7021130", name: "吓退", reduce: 60, counter: [{ type: "escape", target: "opponent" }], counterNote: "敌方脱离" },
  { id: "sk-7170150", name: "报复", reduce: 70, counter: [{ type: "modifyEnergy", target: "opponent", delta: -3 }], counterNote: "敌方失去 3 能量" },
  { id: "sk-7080230", name: "硬化", reduce: 90, counter: [], counterNote: "上次用攻击技则能耗-2（暂略）" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const s of skills) {
  const key = shieldKey(s.id);
  generated.push({
    id: `skill:${s.id}:declare`, ownerType: "skill", ownerId: s.id, trigger: "actionDeclared",
    when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: s.id }, { path: "event.opponentAction.actionType", op: "eq", value: "Attack" }] }],
    effects: [{ type: "forceFirst", target: "self" }, { type: "applyStatus", target: "self", statusId: key, layers: 1 }, ...s.counter],
    note: `${s.name}：应对攻击成功 → 必定先手 + 本回合承伤 −${s.reduce}%；${s.counterNote}`,
  });
  generated.push({
    id: `skill:${s.id}:reduce`, ownerType: "skill", ownerId: s.id, trigger: "beforeDamage",
    when: [{ path: `target.active.statuses.${key}`, op: "gte", value: 1 }],
    effects: [{ type: "setDamageReduction", target: "target", percent: s.reduce }],
    note: `${s.name}：本回合承伤 −${s.reduce}%`,
  });
  generated.push({
    id: `skill:${s.id}:expire`, ownerType: "skill", ownerId: s.id, trigger: "turnEnd",
    when: [{ path: `self.active.statuses.${key}`, op: "gte", value: 1 }],
    effects: [{ type: "removeStatus", target: "self", statusId: key }],
    note: `${s.name}：回合末移除减伤状态`,
  });
}
const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length}，新增 ${toAdd.length}`);
if (!toAdd.length) process.exit(0);
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-11";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`已写入（version ${file.version}，共 ${file.mechanisms.length}）`); }
else console.log("dry-run：加 --write 落盘");
