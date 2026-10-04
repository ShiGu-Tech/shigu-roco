import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const marks = [
  {
    id: "poison-mark",
    name: "中毒印记",
    trigger: "turnEnd",
    when: [{ path: "self.active.marks.poison-mark", op: "gte", value: 1 }],
    effects: [{ type: "dealDamage", target: "self", category: "Passive", power: 0, basis: "maxHp", amount: 0.03, element: "Poison" }],
    note: "中毒印记：回合结束造成 3% 最大生命毒系伤害（术语 1014）",
  },
  {
    id: "attack-mark",
    name: "攻击印记",
    trigger: "beforeDamage",
    when: [{ path: "self.active.marks.attack-mark", op: "gte", value: 1 }],
    effects: [{ type: "modifyDamage", mode: "multiply", value: 1.1, scope: "outgoing" }],
    note: "攻击印记：全技能威力 +10%（术语 1018）",
  },
  {
    id: "photosynthesis-mark",
    name: "光合印记",
    trigger: "turnEnd",
    when: [{ path: "self.active.marks.photosynthesis-mark", op: "gte", value: 1 }],
    effects: [{ type: "modifyEnergy", target: "self", delta: 1 }],
    note: "光合印记：回合结束获得 1 能量（术语 1021）",
  },
  {
    id: "wet-mark",
    name: "湿润印记",
    trigger: "beforeAction",
    when: [{ path: "self.active.marks.wet-mark", op: "gte", value: 1 }],
    effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -1, mode: "add", duration: "turns", turns: 1 }],
    note: "湿润印记：全技能能耗 −1（术语 1022，每回合续期）",
  },
  {
    id: "wind-mark",
    name: "风起印记",
    trigger: "beforeDamage",
    when: [
      { path: "self.active.marks.wind-mark", op: "gte", value: 1 },
      { path: "event.wentFirst", op: "eq", value: true },
    ],
    effects: [{ type: "modifyDamage", mode: "multiply", value: 1.2, scope: "outgoing" }],
    note: "风起印记：先手攻击时本次威力 +20%（术语 1027）",
  },
  {
    id: "electric-charge-mark",
    name: "蓄电印记",
    trigger: "beforeDamage",
    when: [
      { path: "self.active.marks.electric-charge-mark", op: "gte", value: 1 },
      { path: "event.burst", op: "eq", value: true },
    ],
    effects: [{ type: "addPower", value: 10 }],
    note: "蓄电印记：攻击技能迸发时本次威力 +10（术语 1023）",
  },
  {
    id: "momentum-mark",
    name: "蓄势印记",
    trigger: "beforeDamage",
    when: [
      { path: "self.active.marks.momentum-mark", op: "gte", value: 1 },
      { path: "event.damageType", op: "in", value: ["Physical", "Magic"] },
    ],
    effects: [{ type: "modifyDamage", mode: "multiply", value: 1.3, scope: "outgoing" }],
    note: "蓄势印记：全攻击技能威力 +30%（术语 1030）",
  },
  {
    id: "spirit-mark",
    name: "降灵印记",
    trigger: "afterSwitch",
    when: [{ path: "self.active.marks.spirit-mark", op: "gte", value: 1 }],
    effects: [{ type: "modifyEnergy", target: "self", delta: -1 }],
    note: "降灵印记：场上精灵离场后，入场精灵失去 1 能量（术语 1028）",
  },
  {
    id: "thorn-mark",
    name: "棘刺印记",
    trigger: "afterSwitch",
    when: [{ path: "self.active.marks.thorn-mark", op: "gte", value: 1 }],
    effects: [{ type: "dealDamage", target: "self", category: "Passive", power: 0, basis: "maxHp", amount: 0.06 }],
    note: "棘刺印记：场上精灵离场后，入场精灵失去 6% 生命（术语 1019）",
  },
];

const statuses = [
  { id: "moe", name: "萌化", reason: "萌化退化模型（进化链 / 前阶 + 资质重算 + 下场不消失，术语 1006）" },
  { id: "rooted", name: "禁足", reason: "离场锁持续结算（术语 3023：无法离场且不可再获禁足）" },
  { id: "wooden-barrel-state", name: "木桶状态", reason: "信息隐藏 + 行动/受击解除（术语 3024，展示层为主）" },
  { id: "moonfall-star-state", name: "月陨星状态", reason: "信息隐藏 + 行动/受击解除（术语 3025，展示层为主）" },
];

const deferredMarks = [
  { id: "momentum-mark", note: "cost", reason: "蓄势印记能耗 +1（攻击技）" , trigger:"beforeAction", when:[{path:"self.active.marks.momentum-mark",op:"gte",value:1}], effects:[{type:"modifySkillCost",target:"self",scope:"attack",delta:1,mode:"add",duration:"turns",turns:1}]},
];

const unsupportedMarks = [
  { id: "dragon-devour-mark", name: "龙噬印记", reason: "技能能耗阈值触发（skillUsed 事件不带 cost，术语 1031）" },
  { id: "slow-mark", name: "减速印记", reason: "印记持续数值通道 / markApplied 未派发（术语 1032：速度 −10）" },
  { id: "sprout-mark", name: "萌芽印记", reason: "获得增益时 +1 层（buffGained hook，术语 3012）" },
  { id: "undertow-mark", name: "暗涌印记", reason: "离场后入场精灵随机 5 层属性减益（需随机，术语 3020）" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];

for (const m of marks) {
  generated.push({ id: `mark:${m.id}`, ownerType: "mark", ownerId: m.id, trigger: m.trigger, when: m.when, effects: m.effects, note: m.note });
}
for (const m of deferredMarks) {
  generated.push({ id: `mark:${m.id}:${m.note}`, ownerType: "mark", ownerId: m.id, trigger: m.trigger, when: m.when, effects: m.effects, note: `${m.reason}` });
}
for (const m of unsupportedMarks) {
  generated.push({ id: `mark:${m.id}`, ownerType: "mark", ownerId: m.id, trigger: "passive", when: [], effects: [{ type: "unsupported", effectType: "markEffect", reason: `${m.name}：${m.reason}【待校准】` }], note: `${m.name}：${m.reason}` });
}
for (const s of statuses) {
  generated.push({ id: `status:${s.id}`, ownerType: "status", ownerId: s.id, trigger: "passive", when: [], effects: [{ type: "unsupported", effectType: "statusEffect", reason: `${s.name}：${s.reason}【待校准】` }], note: `${s.name}：${s.reason}` });
}

const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
for (const m of generated) if (existing.has(m.id)) console.log("  已存在:", m.id);
if (toAdd.length === 0) { console.log("无新增"); process.exit(0); }

file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入 ${FILE}（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
