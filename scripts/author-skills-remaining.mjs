import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const sid = (id) => ({ path: "event.action.skillId", op: "eq", value: id });
const P = (stat, v) => ({ type: "modifyStat", target: "self", stat, mode: "percent", value: v });
const PO = (stat, v) => ({ type: "modifyStat", target: "opponent", stat, mode: "percent", value: v });
const DEF_COUNTER = { path: "event.opponentAction.actionType", op: "eq", value: "Defense" };

// 可直出
const clean = [
  { id: "sk-7100180", name: "架势", effects: [{ type: "heal", target: "self", amount: 0.2, basis: "maxHp" }], note: "下次无需蓄力待校准" },
  { id: "sk-7130210", name: "贮藏", effects: [P("atk", 50), P("spatk", 50)], note: "每携带 0 能耗技能额外 +50% 待校准" },
  { id: "sk-7060280", name: "分光", effects: [P("spatk", 20)], note: "每不同系别额外 +10% 待校准" },
  { id: "sk-7170330", name: "小型打劫", effects: [{ type: "modifyEnergy", target: "opponent", delta: -1 }], note: "全队口径待校准（当前对在场）" },
  { id: "sk-7030490", name: "花炮", effects: [{ type: "setHits", target: "self", hits: 2 }], note: "每连击魔攻 +60% 待校准" },
  { id: "sk-7160390", name: "耍赖", effects: [P("atk", 10), { type: "setHits", target: "self", hits: 2 }], note: "有减益时 +1 连击待校准" },
  { id: "sk-7020720", name: "操控", effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 7, mode: "add", duration: "turns", turns: 3 }] },
];

// 可直出 + 应对防御分支
const withCounter = [
  { id: "sk-7110250", name: "麻痹", base: [{ type: "setPriority", target: "opponent", value: -1 }], counter: [PO("atk", -70), PO("spatk", -70)], note: "敌方先手 −1" },
  { id: "sk-7080190", name: "流沙", base: [{ type: "applyStatus", target: "opponent", statusId: "rooted", layers: 1 }], counter: [PO("defense", -60), PO("spdef", -60)], note: "3 回合禁足待校准" },
  { id: "sk-7080200", name: "泥浆铠甲", base: [P("atk", 60), P("defense", 60)], counter: [], note: "增益翻倍分支待校准" },
];

// 部分直出 + unsupported（剩余复杂部分）
const partial = [
  { id: "sk-7070050", name: "杠杆置换", base: [{ type: "modifyEnergy", target: "self", delta: 2 }], reason: "交换两侧技能位置（无原语）" },
];

// 明确留 unsupported
const unsupported = [
  { id: "sk-7020550", name: "魔能爆", reason: "变量威力：消耗能量越高伤害越高（哨兵威力）" },
  { id: "sk-7090140", name: "极寒领域", reason: "变量威力 + 冻结联动（哨兵威力）" },
  { id: "sk-7160330", name: "拆礼物", reason: "变量威力 + 萌化联动（哨兵威力）" },
  { id: "sk-7110460", name: "踏雷", reason: "回合末返场 + 迸发效果复制" },
  { id: "sk-7120130", name: "毒雾", reason: "增益 → 中毒 转化（无原语）" },
  { id: "sk-7120160", name: "落井下毒", reason: "属性减益层数翻倍（减益非状态）" },
  { id: "sk-7120290", name: "重金属粉尘", reason: "给携带攻击技能附加中毒（技能级附加）" },
  { id: "sk-7150320", name: "疾风连袭", reason: "释放过的迅捷技能汇总 + 动态能耗" },
  { id: "sk-7160170", name: "示弱", reason: "萌化退化模型 + 永久速度（结构性）" },
  { id: "sk-7160180", name: "赤子之心", reason: "萌化退化模型 + 永久能耗（结构性）" },
  { id: "sk-7160190", name: "反弹", reason: "萌化状态转移（结构性）" },
  { id: "sk-7180350", name: "伪造账单", reason: "「敌方回复生命」钩子" },
  { id: "sk-7180450", name: "掉包", reason: "属性增益 → 减益 转化（无原语）" },
  { id: "sk-7110360", name: "过载回路", reason: "下回合使用次数 +1（无原语）" },
  { id: "sk-7100300", name: "龙守望", reason: "蓄力 + 选择 组合 + 打断眩晕" },
  { id: "sk-7020840", name: "借用", reason: "每回合随机变为队友技能" },
  { id: "sk-7020850", name: "取念", reason: "每回合随机变为敌方技能" },
  { id: "sk-7020860", name: "复写", reason: "每回合随机变为未携带技能" },
  { id: "sk-7030510", name: "富养化", reason: "场下全队回能（无原语）" },
  { id: "sk-7070070", name: "联动装置", reason: "相邻技能威力永久修正" },
  { id: "sk-7070260", name: "排气", reason: "受抵抗伤害累积 → 敌威力 −20" },
  { id: "sk-7090180", name: "雾气环绕", reason: "回能 = 敌方技能总能耗一半" },
  { id: "sk-7090320", name: "冰捆缚", reason: "每连击附加能耗 +1（逐段效果）" },
  { id: "sk-7090470", name: "打喷嚏", reason: "每连击附加冻结（逐段效果）" },
  { id: "sk-7190450", name: "薄纱环", reason: "选择 + 随机印记" },
  { id: "sk-7190460", name: "重组", reason: "下次攻击附加幻系伤害（条件）" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];

for (const s of clean) {
  generated.push({ id: `skill:${s.id}`, ownerType: "skill", ownerId: s.id, trigger: "beforeAction", when: [sid(s.id)], effects: s.effects, note: `${s.name}${s.note ? "：" + s.note : ""}` });
}
for (const s of withCounter) {
  generated.push({ id: `skill:${s.id}`, ownerType: "skill", ownerId: s.id, trigger: "beforeAction", when: [sid(s.id)], effects: s.base, note: `${s.name}：${s.note}` });
  if (s.counter?.length) {
    generated.push({
      id: `skill:${s.id}:counter`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "actionDeclared",
      when: [{ allOf: [sid(s.id), DEF_COUNTER] }],
      effects: [{ type: "forceFirst", target: "self" }, ...s.counter],
      note: `${s.name}：应对防御 → 先手`,
    });
  }
}
for (const s of partial) {
  generated.push({ id: `skill:${s.id}`, ownerType: "skill", ownerId: s.id, trigger: "beforeAction", when: [sid(s.id)], effects: s.base, note: `${s.name}` });
  generated.push({ id: `skill:${s.id}:todo`, ownerType: "skill", ownerId: s.id, trigger: "passive", when: [], effects: [{ type: "unsupported", effectType: "skillEffect", reason: `${s.name}：${s.reason}【待校准】` }], note: `${s.name}：${s.reason}` });
}
for (const s of unsupported) {
  generated.push({ id: `skill:${s.id}`, ownerType: "skill", ownerId: s.id, trigger: "passive", when: [], effects: [{ type: "unsupported", effectType: "skillEffect", reason: `${s.name}：${s.reason}【待校准】` }], note: `${s.name}：${s.reason}` });
}

const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
if (toAdd.length === 0) { console.log("无新增"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
