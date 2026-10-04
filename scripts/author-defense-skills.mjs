import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const shieldKey = (id) => "def-" + id.replace(/^sk-/, "");

const skills = [
  {
    id: "sk-7160290",
    name: "捧杀",
    reduce: 90,
    counter: [{ type: "applyStatus", target: "opponent", statusId: "moe", layers: 1 }],
    counterNote: "敌方 1 层萌化",
    todo: "萌化语义（C1）",
  },
  {
    id: "sk-7090210",
    name: "冰墙",
    reduce: 80,
    counter: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 2, immuneElements: ["Ice"] }],
    counterNote: "敌方 2 层冻结",
  },
  {
    id: "sk-7030520",
    name: "纤维化",
    reduce: 80,
    counter: [{ type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 70 }],
    counterNote: "自己物防 +70%",
  },
  {
    id: "sk-7030330",
    name: "蜡质膜",
    reduce: 80,
    counter: [{ type: "modifyEnergy", target: "self", delta: 3 }],
    counterNote: "回复 3 能量",
  },
  {
    id: "sk-7090340",
    name: "冰蛋壳",
    reduce: 70,
    counter: [{ type: "applyMark", target: "opponent", markId: "slow-mark", layers: 2 }],
    counterNote: "敌方 2 层减速印记",
    todo: "减速印记语义（C1）",
  },
  {
    id: "sk-7160340",
    name: "委屈",
    reduce: 70,
    counter: [{ type: "applyMark", target: "self", markId: "sprout-mark", layers: 1 }],
    counterNote: "自己 1 层萌芽印记",
    todo: "萌芽印记语义（C1）",
  },
  {
    id: "sk-7150150",
    name: "风墙",
    reduce: 50,
    counter: [],
    counterNote: "迅捷（tag，待 C4/C0）",
  },
  {
    id: "sk-7020790",
    name: "防反",
    reduce: 70,
    counter: [
      { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 70 },
      { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 70 },
    ],
    counterNote: "自己物攻 / 魔攻 +70%",
  },
  {
    id: "sk-7110280",
    name: "集中",
    reduce: 80,
    counter: [],
    counterNote: "回合结束返场",
    expireEffects: [{ type: "escape", target: "self" }],
  },
  {
    id: "sk-7140180",
    name: "硬门",
    reduce: null,
    counter: [
      { type: "cancelAction", target: "opponent" },
      { type: "dealDamage", target: "opponent", category: "Physical", power: 90 },
    ],
    counterNote: "打断被应对技能并造成 90 威力物伤",
  },
  // —— 以下应对效果需 C0 通用能力，先登记减伤 + 应对先手，附加效果显式 unsupported ——
  { id: "sk-7130320", name: "虫结阵", reduce: 80, todo: "队伍随机奉献", counterNote: "己方队伍 1 次随机奉献" },
  { id: "sk-7090200", name: "冰天雪地", reduce: 80, todo: "modifySkillCost 动态目标", counterNote: "被应对技能能耗 +3" },
  { id: "sk-7150310", name: "羽翼庇护", reduce: 70, todo: "连击数 buff", counterNote: "自己连击数 +2" },
  { id: "sk-7090350", name: "雪替身", reduce: 70, todo: "读被应对技能能耗", counterNote: "回复能量 = 被应对技能能耗 ×2" },
  { id: "sk-7021120", name: "嗜痛", reduce: 80, todo: "受击累积触发", counterNote: "每受 1 次攻击伤害双攻 +40%" },
  { id: "sk-7120300", name: "毒肽", reduce: 70, todo: "巧变 tag", counterNote: "巧变：毒系状态技能" },
  { id: "sk-7060250", name: "点亮", reduce: 90, todo: "按元素永久威力", counterNote: "光系技能威力永久 +50%" },
  { id: "sk-7180210", name: "等价交换", reduce: 90, todo: "吸血通道", counterNote: "自己获得 50% 吸血" },
  { id: "sk-7140300", name: "防御反击", reduce: 80, todo: "全技能永久威力", counterNote: "自己全技能威力 +40" },
  { id: "sk-7020810", name: "无畏之心", reduce: 100, todo: "减免转回血", counterNote: "减免伤害转为回复，且本技能能耗永久 +2" },
  { id: "sk-7070080", name: "能量守恒", reduce: 80, todo: "相邻技能被动修正", counterNote: "两侧技能能耗永久 −1" },
  { id: "sk-7100320", name: "守护咒", reduce: 90, todo: "巧变 tag", counterNote: "巧变：龙系状态技能" },
  { id: "sk-7140190", name: "听桥", reduce: 60, todo: "读被应对技能威力", counterNote: "对敌方造成威力与被应对技能相等的武系物伤" },
  { id: "sk-7110420", name: "电磁偏转", reduce: 70, todo: "额外使用次数", counterNote: "下回合所选技能使用次数 +1" },
  { id: "sk-7040450", name: "淬火", reduce: 80, todo: "下次攻击威力倍率", counterNote: "下次攻击技能威力翻倍" },
  { id: "sk-7040640", name: "暖气", reduce: 70, todo: "下次攻击威力加成", counterNote: "下次攻击技能威力 +50" },
  { id: "sk-7100250", name: "龙血", reduce: 70, todo: "蓄力 tag", counterNote: "下次技能无需蓄力" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];

for (const s of skills) {
  if (!/^sk-\d+$/.test(s.id)) throw new Error("bad id " + s.id);
  const key = shieldKey(s.id);
  const counter = s.counter
    ? s.counter
    : [{ type: "unsupported", effectType: "defenseCounter", reason: `${s.name}：${counterNote(s)}【待校准】` }];

  if (s.reduce != null) {
    generated.push({
      id: `skill:${s.id}:declare`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "actionDeclared",
      when: [
        {
          allOf: [
            { path: "event.action.skillId", op: "eq", value: s.id },
            { path: "event.opponentAction.actionType", op: "eq", value: "Attack" },
          ],
        },
      ],
      effects: [
        { type: "forceFirst", target: "self" },
        { type: "applyStatus", target: "self", statusId: key, layers: 1 },
        ...counter,
      ],
      note: `${s.name}：应对攻击成功 → 必定先手 + 本回合承伤 −${s.reduce}%；${counterNote(s)}`,
    });
    generated.push({
      id: `skill:${s.id}:reduce`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "beforeDamage",
      when: [{ path: `target.active.statuses.${key}`, op: "gte", value: 1 }],
      effects: [{ type: "setDamageReduction", target: "target", percent: s.reduce }],
      note: `${s.name}：本回合承伤 −${s.reduce}%`,
    });
    generated.push({
      id: `skill:${s.id}:expire`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "turnEnd",
      when: [{ path: `self.active.statuses.${key}`, op: "gte", value: 1 }],
      effects: [{ type: "removeStatus", target: "self", statusId: key }, ...(s.expireEffects ?? [])],
      note: `${s.name}：回合末移除减伤状态`,
    });
  } else {
    generated.push({
      id: `skill:${s.id}`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "actionDeclared",
      when: [
        {
          allOf: [
            { path: "event.action.skillId", op: "eq", value: s.id },
            { path: "event.opponentAction.actionType", op: "eq", value: "Attack" },
          ],
        },
      ],
      effects: [{ type: "forceFirst", target: "self" }, ...counter],
      note: `${s.name}：应对攻击成功 → 必定先手；${counterNote(s)}`,
    });
  }
}

function counterNote(s) {
  return s.counterNote ?? "";
}

const toAdd = generated.filter((m) => !existing.has(m.id));

console.log(`生成 ${generated.length} 条，其中新增 ${toAdd.length} 条（已存在 ${generated.length - toAdd.length}）`);
for (const m of generated) if (existing.has(m.id)) console.log("  已存在跳过:", m.id);

if (toAdd.length === 0) {
  console.log("无新增，退出。");
  process.exit(0);
}

file.mechanisms.push(...toAdd);
file.version = bumpMinor(file.version);
file.updatedAt = "2026-10-04";

const out = JSON.stringify(file, null, 2) + "\n";
if (write) {
  fs.writeFileSync(FILE, out);
  console.log(`已写入 ${FILE}（version ${file.version}，共 ${file.mechanisms.length} 条）`);
} else {
  console.log("dry-run：加 --write 落盘");
}

function bumpMinor(v) {
  const [a, b] = String(v).split(".").map(Number);
  return `${a}.${b + 1}.0`;
}
