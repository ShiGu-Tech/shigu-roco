// 第四期长尾 · 纯数据可直出项：毒雾 / 落井下毒 / 杠杆置换 / 排气。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const removeIds = ["skill:sk-7120130", "skill:sk-7120160", "skill:sk-7070050:todo", "skill:sk-7070260"];

const skillEffect = (skillId, trigger, when, effects, note) => ({
  id: `skill:${skillId}`,
  ownerType: "skill",
  ownerId: skillId,
  trigger,
  when: [{ path: "event.action.skillId", op: "eq", value: skillId }, ...when],
  effects,
  note,
});

const additions = [
  // 毒雾：将敌方所有增益转为等量中毒。
  skillEffect("sk-7120130", "beforeAction", [], [{ type: "convertBuffToStatus", target: "opponent", statusId: "poison", factor: 1 }], "毒雾：敌方所有增益转为等量中毒"),
  // 落井下毒：使敌方减益层数翻倍。
  skillEffect("sk-7120160", "beforeAction", [], [{ type: "scaleStat", target: "opponent", polarity: "debuff", factor: 2 }], "落井下毒：敌方减益层数翻倍"),
  // 排气：使用后敌方威力 −20；每受 1 次抵抗伤害再 −20（使用后重置）。
  { id: "skill:sk-7070260", ownerType: "skill", ownerId: "sk-7070260", trigger: "actionResolved", when: [{ path: "event.action.skillId", op: "eq", value: "sk-7070260" }], effects: [{ type: "setCounter", target: "self", key: "exhaust", value: 1 }], note: "排气：使用后重置为 1 层（敌方威力 −20）" },
  { id: "skill:sk-7070260:onhit", ownerType: "skill", ownerId: "sk-7070260", trigger: "onHit", when: [{ path: "target.active.loadout", op: "contains", value: "sk-7070260" }, { path: "event.resisted", op: "eq", value: true }, { path: "event.damageType", op: "in", value: ["Physical", "Magic"] }], effects: [{ type: "addCounter", target: "target", key: "exhaust", delta: 1 }], note: "排气：每受 1 次抵抗伤害，敌方威力 −20" },
  { id: "skill:sk-7070260:power", ownerType: "skill", ownerId: "sk-7070260", trigger: "beforeDamage", when: [{ path: "target.active.loadout", op: "contains", value: "sk-7070260" }, { path: "target.active.counters.exhaust", op: "gte", value: 1 }], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "target.active.counters.exhaust", scale: -20 } }], note: "排气：敌方攻击威力 −20 × 层数" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let removed = 0;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (removeIds.includes(mechs[i].id)) { mechs.splice(i, 1); removed++; }
}
// 杠杆置换：保留已登记的回能，补「交换两侧技能位置」。
let patched = 0;
const lever = mechs.find((m) => m.id === "skill:sk-7070050");
if (lever) {
  if (!lever.effects.some((e) => e.type === "swap")) { lever.effects.push({ type: "swap", what: "skills" }); patched++; }
  lever.note = "杠杆置换：回复 2 能量 + 交换两侧技能位置";
}
let added = 0;
for (const def of additions) {
  const key = JSON.stringify(def);
  const existing = mechs.find((m) => m.id === def.id);
  if (existing) { if (JSON.stringify(existing) !== key) { Object.assign(existing, def); patched++; } continue; }
  mechs.push(def); added++;
}
console.log(`remove ${removed}，patch ${patched}，add ${added}`);
if (!removed && !patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
