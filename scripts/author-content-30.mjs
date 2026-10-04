import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const n = sp.trait?.name;
  if (!n) continue;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(sp.id);
}
const SELF = (n) => ({ path: "self.active.spriteId", op: "in", value: byName.get(n) ?? [] });
const ENTER = (n) => ({ path: "event.enteredSpriteId", op: "in", value: byName.get(n) ?? [] });
const SKILL = (id) => ({ path: "action.skillId", op: "eq", value: id });
const REACTED = { path: "event.reacted", op: "eq", value: true };

const traitDefs = [
  { name: "抓到你了", defs: [
    { trigger: "onEntry", when: [ENTER("抓到你了")], effects: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 2 }], note: "入场时敌方获 2 层冻结" },
    { trigger: "statusApplied", when: [SELF("抓到你了"), { path: "event.statusId", op: "eq", value: "freeze" }], effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 1, duration: "permanent", key: "grip2-freeze" }], note: "使敌方获冻结时其全技能能耗 +1" },
  ] },
];

const skillDefs = [
  { id: "sk-7180450", defs: [{ trigger: "actionResolved", when: [SKILL("sk-7180450")], effects: [{ type: "convertStatPolarity", target: "opponent", from: "buff" }], note: "掉包：敌方属性增益转为等量减益" }] },
  { id: "sk-7180350", defs: [{ trigger: "actionResolved", when: [SKILL("sk-7180350")], effects: [{ type: "setCounter", target: "opponent", key: "healRedirect", value: 2 }], note: "伪造账单：敌方本回合回复改为失去 2 倍" }] },
  { id: "sk-7021120", defs: [
    { trigger: "actionDeclared", when: [SKILL("sk-7021120"), REACTED], effects: [{ type: "addCounter", target: "self", key: "pain", delta: 1 }], note: "嗜痛：应对成功进入持续" },
    { trigger: "onHit", when: [{ path: "target.active.counters.pain", op: "gte", value: 1 }, { path: "event.damageType", op: "in", value: ["Physical", "Magic"] }], effects: [
      { type: "modifyStat", target: "target", stat: "atk", mode: "percent", value: 40 },
      { type: "modifyStat", target: "target", stat: "spatk", mode: "percent", value: 40 },
    ], note: "嗜痛：每受 1 次攻击伤害双攻 +40%" },
  ] },
  { id: "sk-7060250", defs: [
    { trigger: "actionDeclared", when: [SKILL("sk-7060250"), REACTED], effects: [{ type: "addCounter", target: "self", key: "lightup", delta: 1 }], note: "点亮：应对成功进入持续" },
    { trigger: "beforeDamage", when: [{ path: "self.counters.lightup", op: "gte", value: 1 }, { path: "action.element", op: "eq", value: "Light" }], effects: [{ type: "modifyDamage", target: "self", mode: "multiply", value: 1.5, scope: "outgoing" }], note: "点亮：光系技能威力 +50%" },
  ] },
  { id: "sk-7140300", defs: [
    { trigger: "actionDeclared", when: [SKILL("sk-7140300"), REACTED], effects: [{ type: "addCounter", target: "self", key: "counter", delta: 1 }], note: "防御反击：应对成功进入持续" },
    { trigger: "beforeDamage", when: [{ path: "self.counters.counter", op: "gte", value: 1 }], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.counter", scale: 40 } }], note: "防御反击：全技能威力 +40" },
  ] },
  { id: "sk-7070080", defs: [{ trigger: "actionDeclared", when: [SKILL("sk-7070080"), REACTED], effects: [
    { type: "modifySkillCost", target: "self", scope: "all", delta: -1, duration: "permanent", key: "conserv" },
    { type: "modifySkillCost", target: "opponent", scope: "all", delta: -1, duration: "permanent", key: "conserv2" },
  ], note: "能量守恒：两侧技能能耗永久 −1" }] },
  { id: "sk-7090200", defs: [{ trigger: "actionDeclared", when: [SKILL("sk-7090200"), REACTED], effects: [{ type: "modifySkillCost", target: "opponent", skillIdFrom: "event.opponentAction.skillId", delta: 3, duration: "permanent", key: "blizzard-cost" }], note: "冰天雪地：被应对技能能耗 +3" }] },
  { id: "sk-7090350", defs: [{ trigger: "actionDeclared", when: [SKILL("sk-7090350"), REACTED], effects: [{ type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "event.opponentAction.cost", scale: 2, round: "none" } }], note: "雪替身：回复被应对技能能耗 ×2 的能量" }] },
  { id: "sk-7140190", defs: [
    { trigger: "actionDeclared", when: [SKILL("sk-7140190"), REACTED], effects: [{ type: "setCounter", target: "self", key: "listenPower", valueFrom: { path: "event.opponentAction.cost" } }], note: "听桥：记录被应对技能能耗" },
    { trigger: "skillUsed", when: [SKILL("sk-7140190"), REACTED], effects: [{ type: "dealDamage", target: "opponent", category: "Physical", element: "Fight", power: 0, powerFrom: { path: "self.counters.listenPower" } }], note: "听桥：造成威力等于被应对技能能耗的武系物伤" },
  ] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
const addDef = (ownerType, ownerId, d, note, ph) => {
  const full = { ownerType, ownerId, trigger: d.trigger, when: d.when, effects: d.effects, note };
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `${ownerType}:${ownerId}`, n = 2;
  while (mechs.some((m) => m.id === id)) id = `${ownerType}:${ownerId}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

for (const { name, defs } of traitDefs) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  defs.forEach((d, i) => addDef("trait", sprites[0], d, `特性「${name}」：${d.note}`, i === 0 ? ph : null));
}

for (const { id, defs } of skillDefs) {
  const ph = mechs.find((m) => m.id.startsWith(`skill:${id}`) && m.effects.some((e) => e.type === "unsupported"));
  defs.forEach((d, i) => addDef("skill", id, d, d.note, i === 0 ? ph : null));
  if (!ph) console.log("  ! 未找到技能占位:", id);
}

console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
