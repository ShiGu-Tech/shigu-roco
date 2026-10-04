import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const SKILL = (id) => ({ path: "action.skillId", op: "eq", value: id });

// D5 哨兵变量威力 / 逐段效果（技能）。defs[0] patch 占位，其余追加。
const skills = [
  { id: "sk-7020550", defs: [
    { trigger: "beforeDamage", when: [SKILL("sk-7020550")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.active.energy", scale: 50 } }], note: "魔能爆：消耗能量越高伤害越高（+50 威力/点【待校准】）" },
    { trigger: "actionResolved", when: [SKILL("sk-7020550")], effects: [{ type: "modifyEnergy", target: "self", delta: -999 }], note: "魔能爆：使用后消耗所有能量" },
  ] },
  { id: "sk-7090140", defs: [
    { trigger: "beforeDamage", when: [SKILL("sk-7090140"), { path: "target.active.statuses.freeze", op: "gte", value: 1 }], effects: [{ type: "addPower", target: "self", value: 60 }], note: "极寒领域：敌方有冻结时威力 +60" },
    { trigger: "beforeAction", when: [SKILL("sk-7090140"), { path: "event.reacted", op: "eq", value: true }, { path: "event.opponentAction.actionType", op: "eq", value: "Status" }], effects: [{ type: "scaleStatus", target: "opponent", statusId: "freeze", factor: 2 }], note: "极寒领域：应对状态使冻结翻倍" },
  ] },
  { id: "sk-7160330", defs: [
    { trigger: "beforeDamage", when: [SKILL("sk-7160330"), { path: "target.active.statuses.moe", op: "gte", value: 1 }], effects: [{ type: "addPower", target: "self", value: 100 }], note: "拆礼物：敌方有萌化时威力 +100" },
  ] },
  { id: "sk-7090320", defs: [
    { trigger: "beforeDamage", when: [SKILL("sk-7090320")], effects: [{ type: "setHits", target: "self", hits: 2 }], note: "冰捆缚：2 连击" },
    { trigger: "afterDamage", when: [SKILL("sk-7090320")], effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 2, duration: "permanent", key: "icebind" }], note: "冰捆缚：每次连击敌全技能能耗 +1（2 连击 +2，近似一次）" },
  ] },
  { id: "sk-7090470", defs: [
    { trigger: "beforeDamage", when: [SKILL("sk-7090470")], effects: [{ type: "setHits", target: "self", hits: 3 }], note: "打喷嚏：3 连击" },
    { trigger: "afterDamage", when: [SKILL("sk-7090470")], effects: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 3 }], note: "打喷嚏：每次连击冻结 1 层（3 层）" },
  ] },
  { id: "sk-7030510", defs: [
    { trigger: "actionResolved", when: [SKILL("sk-7030510")], effects: [{ type: "spreadEnergy", target: "self", delta: 3 }], note: "富养化：场下每只回复 3 能量" },
  ] },
  { id: "sk-7090180", defs: [
    { trigger: "actionResolved", when: [SKILL("sk-7090180")], effects: [{ type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "opponent.counters.loadoutCost", scale: 0.5, round: "none" } }], note: "雾气环绕：回复敌方技能总能耗一半的能量" },
  ] },
  { id: "sk-7190460", defs: [
    { trigger: "actionResolved", when: [SKILL("sk-7190460")], effects: [{ type: "addCounter", target: "self", key: "next-damage-mul", delta: 1 }], note: "重组：下次攻击额外 +100% 伤害（系别 / 应对 300% 略）" },
  ] },
  { id: "sk-7190450", defs: [
    { trigger: "actionResolved", when: [SKILL("sk-7190450"), { path: "event.action.choice", op: "neq", value: 1 }], effects: [{ type: "applyMark", target: "opponent", markId: "poison-mark", layers: 2 }], note: "薄纱环·明：敌方获负面印记（近似中毒印记）" },
    { trigger: "actionResolved", when: [SKILL("sk-7190450"), { path: "event.action.choice", op: "eq", value: 1 }], effects: [{ type: "applyMark", target: "self", markId: "attack-mark", layers: 2 }], note: "薄纱环·暗：自身获正面印记（近似攻击印记）" },
  ] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { id, defs } of skills) {
  const ph = mechs.find((m) => m.id.startsWith(`skill:${id}`) && m.effects.some((e) => e.type === "unsupported"));
  defs.forEach((d, i) => {
    const full = { ownerType: "skill", ownerId: id, trigger: d.trigger, when: d.when, effects: d.effects, note: d.note };
    if (i === 0 && ph) { Object.assign(ph, full); patched++; return; }
    let nid = `skill:${id}:x2`, n = 3;
    while (mechs.some((m) => m.id === nid)) nid = `skill:${id}:x${n++}`;
    mechs.push({ id: nid, ...full }); added++;
  });
  if (!ph) console.log("  ! 未找到技能占位:", id);
}
console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
