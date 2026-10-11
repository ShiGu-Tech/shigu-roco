/** 补 龙卷风(sk-7150110)：应对状态 → 本次威力 ×1.5。幂等。 */
import fs from "node:fs";
const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const key = "react-7150110";
const mechs = [
  {
    id: "skill:sk-7150110:react", ownerType: "skill", ownerId: "sk-7150110", trigger: "actionDeclared",
    when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: "sk-7150110" }, { path: "event.opponentAction.actionType", op: "eq", value: "Status" }] }],
    effects: [{ type: "applyStatus", target: "self", statusId: key, layers: 1 }],
    note: "龙卷风：应对状态成功 → 本次威力 ×1.5",
  },
  {
    id: "skill:sk-7150110:react-mul", ownerType: "skill", ownerId: "sk-7150110", trigger: "beforeDamage",
    when: [{ path: `self.active.statuses.${key}`, op: "gte", value: 1 }],
    effects: [{ type: "modifyDamage", mode: "multiply", value: 1.5, scope: "outgoing" }],
    note: "龙卷风：应对状态下威力 ×1.5",
  },
  {
    id: "skill:sk-7150110:react-expire", ownerType: "skill", ownerId: "sk-7150110", trigger: "turnEnd",
    when: [{ path: `self.active.statuses.${key}`, op: "gte", value: 1 }],
    effects: [{ type: "removeStatus", target: "self", statusId: key }],
    note: "龙卷风：回合末清除应对状态",
  },
];
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
for (const m of mechs) {
  const cur = file.mechanisms.find((x) => x.id === m.id);
  if (cur) Object.assign(cur, m); else file.mechanisms.push(m);
}
console.log("已 upsert 3 条");
if (write) {
  const [a, b] = String(file.version).split(".").map(Number);
  file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-11";
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log("version", file.version);
}
