/** 把 unsupported 副效果真实现 + 补 下注 选择分支。`--write` 落盘。 */
import fs from "node:fs";
const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const M = file.mechanisms;
const get = (id) => M.find((m) => m.id === id);
const setEffects = (id, effects) => { const m = get(id); if (m) m.effects = effects; else console.log("!! 未找到", id); };

// —— 6 个防御技：替换 declare 里的 unsupported 副效果 ——
const defCounter = {
  "sk-7020800": null, // 血气：改用 beforeFatal 机制（下方）
  "sk-7021110": [{ type: "setPriority", target: "self", value: 1 }],
  "sk-7050280": [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, duration: "turns", turns: 3 }],
  "sk-7060150": null, // 镜像反射：本技能变为被应对技能（需新能力，保留 unsupported）
  "sk-7130220": [{ type: "escape", target: "self" }, { type: "scheduleEntry", target: "self", effects: [{ type: "applyStatus", target: "self", statusId: "entry-guard", layers: 1 }] }],
  "sk-7180330": [{ type: "setRuleModifier", target: "self", key: "cost.payWithHp", value: true }],
};
for (const [id, counter] of Object.entries(defCounter)) {
  const m = get(`skill:${id}:declare`);
  if (!m) { console.log("!! declare 缺", id); continue; }
  m.effects = (m.effects ?? []).filter((e) => e.type !== "unsupported");
  if (counter) m.effects.push(...counter);
}

// —— 6 个状态技：替换自身机制里的 unsupported ——
const statFx = {
  "sk-7060140": [{ type: "modifySkill", target: "self", scope: "carried", power: 35, oncePerElement: true }], // 漫反射：每种系别至多一个技能威力+35
  "sk-7060240": [{ type: "setRuleModifier", target: "self", key: "power.element.Light", value: 0.5 }],
  "sk-7150300": [{ type: "addCounter", target: "self", key: "power-add", delta: 20 }, { type: "setPriority", target: "self", value: 1 }],
  "sk-7130310": [{ type: "consumeMark", target: "opponent", effectsPerLayer: [{ type: "heal", target: "self", amount: 0.1, basis: "maxHp" }] }], // 食腐：驱散敌方印记，每层回 10% 生命
  "sk-7160160": [{ type: "clearStat", target: "self", polarity: "debuff", layers: 99 }, { type: "scaleStat", target: "self", polarity: "buff", delta: 1 }],
  "sk-7160200": [{ type: "applyStatus", target: "self", statusId: "moe", layers: 1 }, { type: "applyStatus", target: "opponent", statusId: "moe", layers: 1 }, { type: "heal", target: "self", amount: 0.4, basis: "maxHp" }],
};
for (const [id, effects] of Object.entries(statFx)) {
  const m = get(`skill:${id}`);
  if (!m || !effects) continue;
  m.effects = effects;
}

// —— 血气：致命保留 1 血 ——
const fatal = {
  id: "skill:sk-7020800:fatal", ownerType: "skill", ownerId: "sk-7020800", trigger: "beforeFatal",
  when: [{ path: "self.active.statuses.def-7020800", op: "gte", value: 1 }],
  effects: [{ type: "heal", target: "self", amount: 1 }],
  note: "血气：应对成功本回合受到致命伤害时保留 1 生命",
};
const curFatal = get(fatal.id); if (curFatal) Object.assign(curFatal, fatal); else M.push(fatal);

// —— 下注：选择分支 ——
const sid = "sk-7180420";
const bet = [
  { id: `skill:${sid}:power0`, ownerType: "skill", ownerId: sid, trigger: "beforeDamage",
    when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: sid }, { path: "event.action.choice", op: "neq", value: 1 }] }],
    effects: [{ type: "addPower", target: "self", value: 40 }], note: "下注·明：威力 +40" },
  { id: `skill:${sid}:selfdmg0`, ownerType: "skill", ownerId: sid, trigger: "beforeAction",
    when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: sid }, { path: "event.action.choice", op: "neq", value: 1 }] }],
    effects: [{ type: "dealDamage", target: "self", category: "Passive", power: 0, basis: "maxHp", amount: 0.1 }], note: "下注·明：用后自伤 10%" },
  { id: `skill:${sid}:power1`, ownerType: "skill", ownerId: sid, trigger: "beforeDamage",
    when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: sid }, { path: "event.action.choice", op: "eq", value: 1 }, { path: "self.active.hp", op: "lt", valueFrom: { path: "self.active.maxHp", scale: 0.5 } }] }],
    effects: [{ type: "modifyDamage", mode: "multiply", value: 2, scope: "outgoing" }], note: "下注·暗：HP<50% 时威力 +100%" },
];
for (const m of bet) { const c = get(m.id); if (c) Object.assign(c, m); else M.push(m); }

// 下注：显式基础伤害（因含作者化 dealDamage，服务端不再自动生成基础伤害）
const baseEffects = [{ type: "dealDamage", target: "target", category: "Physical", power: 85, skillId: sid }];
const base = get(`skill:${sid}`);
if (base) base.effects = baseEffects;
else M.push({ id: `skill:${sid}`, ownerType: "skill", ownerId: sid, trigger: "beforeAction", when: [{ path: "event.action.skillId", op: "eq", value: sid }], effects: baseEffects, note: "下注：基础物伤" });

console.log("完成");
if (write) { const [a, b] = String(file.version).split(".").map(Number); file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-11"; fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log("version", file.version); }
