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
const TARGET = (n) => ({ path: "target.active.spriteId", op: "in", value: byName.get(n) ?? [] });
const ENTER = (n) => ({ path: "event.enteredSpriteId", op: "in", value: byName.get(n) ?? [] });
const IN_LOADOUT = (id) => ({ path: "self.active.loadout", op: "contains", value: id });
const ELEM = (arr) => ({ path: "action.element", op: "in", value: arr });

// A/B/C/H 长尾。部分为近似（见 note）。
const traits = [
  // —— H 计数 / 生命回复钩子 ——
  { name: "悼亡", def: { trigger: "onEntry", when: [ENTER("悼亡")], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.bothFaints", scale: 30 } },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "self.counters.bothFaints", scale: 30 } },
  ], note: "双方每有 1 只力竭精灵，双攻 +30%" } },
  { name: "旧玩具", def: { trigger: "onEntry", when: [ENTER("旧玩具")], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedElementKinds", scale: 10 } },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedElementKinds", scale: 10 } },
  ], note: "己方每使用过 1 个不同系别技能，入场双攻 +10%" } },
  { name: "渗透", def: { trigger: "onEntry", when: [ENTER("渗透")], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedFight", scale: 5 } },
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedGround", scale: 5 } },
    { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedFight", scale: 5 } },
    { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 0, valueFrom: { path: "self.counters.usedGround", scale: 5 } },
  ], note: "每使用 1 次武系或地系技能，入场时攻防 +5%" } },
  { name: "搜刮", def: { trigger: "onEntry", when: [ENTER("搜刮")], effects: [
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "opponent.counters.charges", scale: 20 } },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "opponent.counters.switches", scale: 20 } },
  ], note: "敌方每聚能 / 换人 1 次，入场魔攻 +20%" } },
  { name: "扫荡", def: { trigger: "onEntry", when: [ENTER("扫荡")], effects: [
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "opponent.counters.charges", scale: 20 } },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "opponent.counters.switches", scale: 20 } },
    { type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 0, valueFrom: { path: "opponent.counters.charges", scale: 10 } },
    { type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 0, valueFrom: { path: "opponent.counters.switches", scale: 10 } },
  ], note: "敌方每聚能 / 换人 1 次，入场魔攻 +20%、魔防 +10%" } },
  { name: "盘根木", def: { trigger: "onEntry", when: [ENTER("盘根木")], effects: [{ type: "heal", target: "self", basis: "maxHp", amount: 0, amountFrom: { path: "self.counters.usedGrass", scale: 0.3, round: "none" } }], note: "入场前己方每使用 1 次草系技能回复 30% 生命（略去初始 10%）" } },
  { name: "腐植循环", def: { trigger: "energyGained", when: [SELF("腐植循环")], effects: [{ type: "heal", target: "self", basis: "maxHp", amount: 0, amountFrom: { path: "event.value", scale: 0.05, round: "none" } }], note: "每回复 1 能量同时回复 5% 生命" } },
  { name: "草木苏醒时", def: { trigger: "energyGained", when: [SELF("草木苏醒时")], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "event.value", scale: 20 } },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 0, valueFrom: { path: "event.value", scale: 20 } },
  ], note: "每回复 1 能量双攻永久 +20%（攻击后重置）" } },
  { name: "草木苏醒时#reset", def: { trigger: "actionResolved", when: [SELF("草木苏醒时"), { path: "action.category", op: "in", value: ["Physical", "Magic"] }], effects: [
    { type: "clearStat", target: "self", stat: "atk", polarity: "buff" },
    { type: "clearStat", target: "self", stat: "spatk", polarity: "buff" },
  ], note: "攻击后重置双攻加成" }, extra: true },
  { name: "抓到你", def: { trigger: "onEntry", when: [ENTER("抓到你")], effects: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 2 }], note: "入场时敌方获 2 层冻结" } },
  { name: "抓到你#cost", def: { trigger: "statusApplied", when: [SELF("抓到你"), { path: "event.statusId", op: "eq", value: "freeze" }], effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 1, duration: "permanent", key: "grip-freeze" }], note: "使敌方获得冻结时，其全技能能耗 +1" }, extra: true },
  { name: "做噩梦", def: { trigger: "afterSwitch", when: [TARGET("做噩梦")], effects: [{ type: "modifyEnergy", target: "self", delta: -3 }], note: "敌方精灵离场后，换入精灵失去 3 能量" } },
  { name: "下黑手", def: { trigger: "afterSwitch", when: [TARGET("下黑手")], effects: [{ type: "applyStatus", target: "self", statusId: "poison", layers: 5 }], note: "敌方精灵离场后，换入精灵获 5 层中毒" } },
  { name: "变形活画", def: { trigger: "beforeDamage", when: [SELF("变形活画")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "opponent.active.buffs.*", scale: 10 } }], note: "行动时敌方每有 1 层增益威力 +10（速度部分略）" } },
  { name: "多人宿舍", def: { trigger: "passive", when: [SELF("多人宿舍")], effects: [{ type: "setRuleModifier", target: "self", key: "energy.noCap", value: true }], note: "能量可超过上限" } },
  { name: "冰钻", def: { trigger: "beforeDamage", when: [SELF("冰钻")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "opponent.counters.loadoutCost", scale: 10 } }], note: "敌方携带总能耗每 1 点威力 +10（近似为固定 +10/点）" } },
  { name: "定向精炼", def: { trigger: "beforeDamage", when: [SELF("定向精炼"), ELEM(["Mechanic", "Ground"])], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.usedTypeDefense", scale: 10 } }], note: "己方每使用 1 次防御技能，机械 / 地系技能威力 +10" } },
  { name: "身经百练", def: { trigger: "beforeDamage", when: [SELF("身经百练"), ELEM(["Water", "Fight"])], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.reacts", scale: 20 } }], note: "己方每应对 1 次，水系 / 武系技能威力 +20（近似为固定 +20）" } },
  // —— C 蓄力 ——
  { name: "洄游", def: { trigger: "charged", when: [SELF("洄游")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, duration: "permanent", key: "huiyou" }], note: "每次进入蓄力，全技能能耗永久 −2" } },
  // —— B 随机技能来源 ——
  { name: "取念", def: { trigger: "turnStart", when: [SELF("取念"), IN_LOADOUT("sk-7020850")], effects: [{ type: "randomizeSkill", target: "self", skillId: "sk-7020850", sourceFrom: "opponent.active.loadout", duration: 0 }], note: "每回合随机变为敌方携带技能" } },
  { name: "借用", def: { trigger: "turnStart", when: [SELF("借用"), IN_LOADOUT("sk-7020840")], effects: [{ type: "randomizeSkill", target: "self", skillId: "sk-7020840", sourceFrom: "self.bench.0.loadout", duration: 0 }], note: "每回合随机变为队友技能（取场下首只）" } },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, def, extra } of traits) {
  const base = name.replace(/#.*$/, "");
  const sprites = byName.get(base);
  if (!sprites?.length) { console.log("  ! 未找到特性:", base); continue; }
  const full = { ownerType: "trait", ownerId: sprites[0], ...def, note: `特性「${base}」：${def.note}` };
  if (!extra) {
    const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${base}」`));
    if (ph) { Object.assign(ph, full); patched++; continue; }
  }
  let id = `trait:${sprites[0]}`, n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${sprites[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
}

console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
