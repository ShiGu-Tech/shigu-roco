// 第四期 · 结构族批量：展翅/异类/游弋/噼啪噼啪/翼轴/翻垃圾桶/机械变式/瞳中倒影/夺目/风速仪/铭记于月亮/龙守望/禁足。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byTrait = new Map();
for (const sp of catalog.sprites) {
  const n = sp.trait?.name;
  if (!n) continue;
  if (!byTrait.has(n)) byTrait.set(n, []);
  byTrait.get(n).push(sp.id);
}
const skillByName = new Map();
for (const sk of Object.values(catalog.allSkills)) {
  if (sk?.skillName && !skillByName.has(sk.skillName)) skillByName.set(sk.skillName, sk.id);
}
const ids = (name) => byTrait.get(name) ?? [];
const skillId = (name) => skillByName.get(name);

const traitNames = ["展翅", "异类", "游弋", "噼啪噼啪！", "翼轴", "翻垃圾桶", "机械变式", "瞳中倒影", "夺目", "风速仪", "铭记于月亮", "天通地明"];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
// 仅移除本批对应的占位机制（特性占位 / 龙守望蓄力占位 / 禁足占位），不动同 owner 的其它机制。
for (let i = mechs.length - 1; i >= 0; i--) {
  const m = mechs[i];
  const traitPlaceholder = m.ownerType === "trait" && traitNames.some((n) => String(m.note ?? "").startsWith(`特性「${n}」`));
  if (traitPlaceholder || m.id === "skill:sk-7100300:charge" || m.id === "status:rooted") mechs.splice(i, 1);
}

const added = [];
const push = (m) => added.push(m);

// 展翅：普通系技能视为翼系；后于敌方行动时受伤 +25%。
{
  const s = ids("展翅");
  if (s.length) {
    push({ id: `trait:${s[0]}#wing`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "element.normalToWing", value: true }], note: "特性「展翅」：普通系技能视为翼系" });
    push({ id: `trait:${s[0]}#wing-hurt`, ownerType: "trait", ownerId: s[0], trigger: "beforeDamage", when: [{ path: "target.active.spriteId", op: "in", value: s }, { path: "event.wentFirst", op: "eq", value: true }], effects: [{ type: "modifyDamage", target: "self", mode: "add", value: 0.25, scope: "incoming" }], note: "特性「展翅」：后于敌方行动时受伤 +25%" });
  }
}
// 异类：翼系攻击技能能耗 +1，攻击时吸血 50%。
{
  const s = ids("异类");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "cost.wingAttack", value: true }, { type: "setRuleModifier", target: "self", key: "lifesteal.wingAttack", value: true }], note: "特性「异类」：携带的翼系攻击技能能耗 +1，攻击时吸血 50%" });
}
// 游弋：蓄力状态下可使用任一携带技能，双防 +100%。
{
  const s = ids("游弋");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "charge.any", value: true }, { type: "setRuleModifier", target: "self", key: "charge.defenseMul", value: true }], note: "特性「游弋」：蓄力状态下可使用任一携带技能，蓄力时双防 +100%" });
}
// 噼啪噼啪！：入场后首次行动所选技能使用次数 +1；该回合每次行动后回复 2 能量。
{
  const s = ids("噼啪噼啪！");
  if (s.length) {
    push({ id: `trait:${s[0]}#entry`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "addCounter", target: "self", key: "extraUses", delta: 1 }, { type: "setCounter", target: "self", key: "pxregen", value: 1 }], note: "特性「噼啪噼啪！」：入场后首次行动所选技能使用次数 +1" });
    push({ id: `trait:${s[0]}#regen`, ownerType: "trait", ownerId: s[0], trigger: "actionResolved", when: [{ path: "self.active.spriteId", op: "in", value: s }, { path: "self.active.counters.pxregen", op: "gte", value: 1 }], effects: [{ type: "modifyEnergy", target: "self", delta: 2 }], note: "特性「噼啪噼啪！」：入场回合每次行动后回复 2 能量" });
    push({ id: `trait:${s[0]}#regen-end`, ownerType: "trait", ownerId: s[0], trigger: "turnEnd", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setCounter", target: "self", key: "pxregen", value: 0 }], note: "特性「噼啪噼啪！」：回合末清空回能窗口" });
  }
}
// 翼轴：1 号位技能获得迅捷且每回合传动 1。
{
  const s = ids("翼轴");
  if (s.length) {
    push({ id: `trait:${s[0]}#quick`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "quick.slot1", value: true }], note: "特性「翼轴」：1 号位技能获得迅捷" });
    push({ id: `trait:${s[0]}#shift`, ownerType: "trait", ownerId: s[0], trigger: "turnStart", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "rotateLoadout", target: "self", skillIdFrom: "self.active.loadout.0", slots: 1 }], note: "特性「翼轴」：1 号位传动 1" });
  }
}
// 翻垃圾桶：入场时未携带的技能位置变为敌方最近使用的技能且能耗 -2。
{
  const s = ids("翻垃圾桶");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "learnSkill", target: "self", skillIdFrom: "opponent.lastTurn.skillId", costDelta: -2 }], note: "特性「翻垃圾桶」：入场时未携带的技能位置变为敌方最近使用的技能且能耗 -2" });
}
// 机械变式：回合内携带技能位置变化 → 该技能能耗永久 -1。
{
  const s = ids("机械变式");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "cost.slotChangePenalty", value: true }], note: "特性「机械变式」：回合内技能位置变化则该技能能耗永久 -1" });
}
// 瞳中倒影：己方精灵离场时自己与换入者交换血量百分比。
{
  const s = ids("瞳中倒影");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "switch.swapHpRatio", value: true }], note: "特性「瞳中倒影」：己方或其他精灵离场时自己与换入者交换血量百分比" });
}
// 夺目：非光系技能威力 +25%；额外获得三个未携带随机技能。
{
  const s = ids("夺目");
  if (s.length) {
    push({ id: `trait:${s[0]}#power`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "power.nonLight", value: 0.25 }], note: "特性「夺目」：非光系技能威力 +25%" });
    push({ id: `trait:${s[0]}#extra`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }, { path: "event.first", op: "eq", value: true }], effects: [{ type: "learnRandomSkills", target: "self", count: 3, sourceFrom: "uncarried", duration: -1 }], note: "特性「夺目」：额外获得三个未携带随机技能" });
  }
}
// 风速仪：携带技能每累计传动 8 → 1 层风起印记。
{
  const s = ids("风速仪");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "wind.tractionPerMark", value: 8 }], note: "特性「风速仪」：携带的技能每累计传动 8 获得 1 层风起印记" });
}
// 铭记于月亮：每次攻击后失去 5% 生命（继承特性待实现）。
{
  const s = ids("铭记于月亮");
  if (s.length) {
    push({ id: `trait:${s[0]}#recoil`, ownerType: "trait", ownerId: s[0], trigger: "afterDamage", when: [{ path: "self.active.spriteId", op: "in", value: s }, { anyOf: [{ path: "event.damageType", op: "eq", value: "Physical" }, { path: "event.damageType", op: "eq", value: "Magic" }] }], effects: [{ type: "heal", target: "self", amount: -0.05, basis: "maxHp" }], note: "特性「铭记于月亮」：每次攻击后失去 5% 生命" });
    push({ id: `trait:${s[0]}#inherit`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [], effects: [{ type: "unsupported", effectType: "inheritTrait", reason: "铭记于月亮：获得自己击败的精灵的特性【待校准】" }], note: "特性「铭记于月亮」：待实现（继承特性）" });
  }
}
// 天通地明：敌方为污染血脉时技能威力 +100%。
{
  const s = ids("天通地明");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "power.vsPolluted", value: true }], note: "特性「天通地明」：攻击时若敌方血脉是污染血脉，技能威力 +100%" });
}
// 龙守望：蓄力状态下可使用本技能。
{
  const sid = skillId("龙守望");
  if (sid) push({ id: `skill:${sid}:charge`, ownerType: "skill", ownerId: sid, trigger: "passive", when: [], effects: [{ type: "setRuleModifier", target: "self", key: `charge.skill.${sid}`, value: true }], note: "龙守望：蓄力状态下可使用本技能" });
}
// 禁足：离场锁持续结算（换人门控内建）。
// （status:rooted 原占位机制已移除；引擎在换人判定读取 statuses.rooted。）

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
