import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const name = sp.trait?.name;
  if (!name) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(sp.id);
}
const SELF = (n) => ({ path: "self.active.spriteId", op: "in", value: byName.get(n) ?? [] });
const ENTER = (n) => ({ path: "event.enteredSpriteId", op: "in", value: byName.get(n) ?? [] });
const OP_ENTER = (n) => ({ path: "targetSide", op: "eq", value: "x" }); // unused

// defs：name → 机制定义数组（首条 patch 占位，其余追加）。能量 / 属性读 `self.counters.*`，敌方读 `opponent.counters.*`。
const defs = [
  { name: "地脉", defs: [{ trigger: "onEntry", when: [ENTER("地脉")], effects: [{ type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "self.counters.usedGround", scale: 3 } }], note: "入场前每放 1 次地系技能回复 3 能量" }] },
  { name: "地脉馈赠", defs: [{ trigger: "onEntry", when: [ENTER("地脉馈赠")], effects: [{ type: "modifyEnergy", target: "self", delta: 10 }, { type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "self.counters.usedGround", scale: 3 } }], note: "回复 10 + 入场前每放 1 次地系技能 +3" }] },
  { name: "结晶水", defs: [{ trigger: "onEntry", when: [ENTER("结晶水")], effects: [{ type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "self.counters.usedIce", scale: 3 } }], note: "入场前每放 1 次冰系技能回复 3 能量" }] },
  { name: "散热", defs: [{ trigger: "onEntry", when: [ENTER("散热")], effects: [{ type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "self.counters.usedFire", scale: 3 } }], note: "入场前每放 1 次火系技能回复 3 能量" }] },
  { name: "慢热型", defs: [{ trigger: "onEntry", when: [ENTER("慢热型")], effects: [{ type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "self.counters.reacts", scale: 5 } }], note: "入场前己方每成功应对 1 次回复 5 能量" }] },
  { name: "水翼推进", defs: [{ trigger: "onEntry", when: [ENTER("水翼推进")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 0, deltaFrom: { path: "self.counters.usedWater", scale: -1 }, duration: "permanent", key: "water-wing" }], note: "每使用 1 次水系技能，入场时全技能能耗 −1" }] },
  { name: "水翼飞升", defs: [
    { trigger: "onEntry", when: [ENTER("水翼飞升")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 0, deltaFrom: { path: "self.counters.usedWater", scale: -1 }, duration: "permanent", key: "water-wing-2" }], note: "每使用 1 次水系技能，入场时全技能能耗 −1" },
    { trigger: "beforeDamage", when: [SELF("水翼飞升"), { path: "action.cost", op: "eq", value: 0 }], effects: [{ type: "modifyDamage", target: "self", mode: "multiply", value: 1.3, scope: "outgoing" }], note: "能耗为 0 的技能威力 +30%" },
  ] },
  { name: "蒸汽膨胀", defs: [{ trigger: "beforeDamage", when: [SELF("蒸汽膨胀")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.usedFire", scale: 10 } }], note: "己方每使用 1 次火系技能，全技能威力 +10" }] },
  { name: "蒸汽革命", defs: [
    { trigger: "onEntry", when: [ENTER("蒸汽革命")], effects: [{ type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedFire", scale: 5 } }], note: "己方每使用 1 次火系技能，入场时物防 +5%" },
    { trigger: "beforeDamage", when: [SELF("蒸汽革命")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.usedFire", scale: 10 } }], note: "全技能威力 +10×火系技能次数" },
  ] },
  { name: "淬炼火", defs: [{ trigger: "onEntry", when: [ENTER("淬炼火")], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedFire", scale: 10 } },
    { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedFire", scale: 10 } },
    { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedFire", scale: 10 } },
  ], note: "入场前己方每使用 1 次火系技能，攻防速 +10%（略去最多 10 次上限）" }] },
  { name: "拨浪鼓", defs: [{ trigger: "beforeDamage", when: [SELF("拨浪鼓"), { path: "action.element", op: "in", value: ["Poison", "Fairy"] }], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.usedTypeStatus", scale: 10 } }], note: "己方每使用 1 次状态技能，毒/萌系技能威力 +10" }] },
  { name: "溶解扩散", defs: [{ trigger: "skillUsed", when: [SELF("溶解扩散"), { path: "event.element", op: "eq", value: "Water" }], effects: [{ type: "applyStatus", target: "opponent", statusId: "poison", layersFrom: { path: "self.counters.loadoutPoison", scale: 1 } }], note: "每携带 1 个毒系技能，水系技能使敌方获 1 层中毒" }] },
  { name: "溶解腐蚀", defs: [{ trigger: "skillUsed", when: [SELF("溶解腐蚀"), { path: "event.element", op: "eq", value: "Water" }], effects: [{ type: "applyStatus", target: "opponent", statusId: "poison", layersFrom: { path: "self.counters.loadoutPoison", scale: 2 } }], note: "每携带 1 个毒系技能，水系技能使敌方获 2 层中毒" }] },
  { name: "血型吸引", defs: [{ trigger: "beforeDamage", when: [SELF("血型吸引")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "opponent.counters.loadoutElements", scale: 10 } }], note: "敌方每携带 1 种系别技能，威力 +10" }] },
  { name: "悲悯", defs: [{ trigger: "onEntry", when: [ENTER("悲悯")], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.faints", scale: 30 } },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "self.counters.faints", scale: 30 } },
  ], note: "己方每有 1 只力竭精灵，双攻 +30%" }] },
  { name: "壮胆", defs: [{ trigger: "onEntry", when: [ENTER("壮胆"), { path: "self.counters.teamInsect", op: "gte", value: 1 }], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 50 },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 50 },
  ], note: "队伍存在虫系精灵则双攻 +50%" }] },
  { name: "虫群鼓舞", defs: [{ trigger: "onEntry", when: [ENTER("虫群鼓舞"), { path: "self.counters.teamInsect", op: "gte", value: 1 }], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.teamInsect", terms: [{ coef: 10, power: 1 }, { coef: -10, power: 0 }] } },
    { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 0, valueFrom: { path: "self.counters.teamInsect", terms: [{ coef: 10, power: 1 }, { coef: -10, power: 0 }] } },
    { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 0, valueFrom: { path: "self.counters.teamInsect", terms: [{ coef: 10, power: 1 }, { coef: -10, power: 0 }] } },
  ], note: "队伍每有 1 只其他虫系精灵，入场时攻防速 +10%" }] },
  { name: "虫群突袭", defs: [{ trigger: "onEntry", when: [ENTER("虫群突袭"), { path: "self.counters.teamInsect", op: "gte", value: 1 }], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.teamInsect", terms: [{ coef: 15, power: 1 }, { coef: -15, power: 0 }] } },
    { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 0, valueFrom: { path: "self.counters.teamInsect", terms: [{ coef: 15, power: 1 }, { coef: -15, power: 0 }] } },
    { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 0, valueFrom: { path: "self.counters.teamInsect", terms: [{ coef: 15, power: 1 }, { coef: -15, power: 0 }] } },
  ], note: "队伍每有 1 只其他虫系精灵，入场时攻防速 +15%" }] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
const existing = new Set(mechs.map((m) => m.id));
let patched = 0, added = 0;
for (const { name, defs: list } of defs) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const placeholder = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  let baseId = `trait:${sprites[0]}`;
  list.forEach((d, i) => {
    const def = { ownerType: "trait", ownerId: sprites[0], trigger: d.trigger, when: d.when, effects: d.effects, note: `特性「${name}」：${d.note}` };
    if (i === 0 && placeholder) { Object.assign(placeholder, def); patched++; return; }
    let id = baseId; let n = 2;
    while (existing.has(id) || mechs.some((m) => m.id === id)) id = `${baseId}#${n++}`;
    mechs.push({ id, ...def }); existing.add(id); added++;
  });
}

console.log(`patch ${patched} 条，新增 ${added} 条`);
if (patched === 0 && added === 0) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
