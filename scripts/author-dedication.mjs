import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const sid = (id) => ({ path: "event.action.skillId", op: "eq", value: id });
const grant = (key, value, count) => ({ type: "grantDedication", target: "self", ...(key ? { key } : {}), ...(value !== undefined ? { value } : {}), ...(count ? { count } : {}) });

// 会受奉献影响的目标技能：使用前消耗一个奉献。
const targets = ["sk-7130100", "sk-7130130"]; // 啃咬 / 虫群

// 施加奉献的技能。
const grants = [
  { id: "sk-7130110", name: "飞断", effects: [grant("power", 20, 1)] },
  { id: "sk-7130120", name: "虫群过境", effects: [grant("combo", 1, 1)] },
  { id: "sk-7130180", name: "假寐", effects: [{ type: "modifyEnergy", target: "self", delta: 2 }, grant("cost", 2, 1)], note: "回复 2 能量" },
  { id: "sk-7130190", name: "虫茧", effects: [{ type: "heal", target: "self", amount: 0.2, basis: "maxHp" }, grant("lifesteal", 0.1, 1)], note: "回复 20% 生命" },
  { id: "sk-7130200", name: "虫群智慧", effects: [grant(undefined, undefined, 2)] },
  { id: "sk-7130320", name: "虫结阵", counter: [grant(undefined, undefined, 1)], defense: true },
  { id: "sk-7130360", name: "信息素", effects: [grant(undefined, undefined, 1)], note: "上回合地系额外 +3 待校准" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];

for (const id of targets) {
  // 啃咬 / 虫群：actionDeclared 消耗一个奉献（受奉献影响）。
  generated.push({
    id: `skill:${id}:dedication`,
    ownerType: "skill",
    ownerId: id,
    trigger: "actionDeclared",
    when: [sid(id)],
    effects: [{ type: "consumeDedication", target: "self", skillId: id }],
    note: "受奉献影响：消耗队伍一个奉献（取队列首个）",
  });
}

for (const g of grants) {
  if (g.defense) {
    // 防御技：追加到 declare（应对攻击成功时）
    const m = file.mechanisms.find((x) => x.id === `skill:${g.id}:declare`);
    if (m) {
      m.effects = m.effects.filter((e) => e.type !== "unsupported");
      m.effects.push(...g.counter);
      m.note = `${g.name}：应对攻击成功 → 必定先手 + 本回合承伤减伤；己方队伍 1 次随机奉献`;
    } else console.log("  ! 未找到 declare:", g.id);
    continue;
  }
  generated.push({
    id: `skill:${g.id}`,
    ownerType: "skill",
    ownerId: g.id,
    trigger: "beforeAction",
    when: [sid(g.id)],
    effects: g.effects,
    note: `${g.name}：获得奉献${g.note ? "（" + g.note + "）" : ""}`,
  });
}

// 振翅：选择 —— 明：连击+1；暗：威力+20
generated.push({
  id: "skill:sk-7130330:light",
  ownerType: "skill",
  ownerId: "sk-7130330",
  trigger: "beforeAction",
  when: [{ allOf: [sid("sk-7130330"), { path: "event.action.choice", op: "neq", value: 1 }] }],
  effects: [grant("combo", 1, 1)],
  note: "振翅：选择·明 → 奉献 连击+1",
});
generated.push({
  id: "skill:sk-7130330:dark",
  ownerType: "skill",
  ownerId: "sk-7130330",
  trigger: "beforeAction",
  when: [{ allOf: [sid("sk-7130330"), { path: "event.action.choice", op: "eq", value: 1 }] }],
  effects: [grant("power", 20, 1)],
  note: "振翅：选择·暗 → 奉献 威力+20",
});

const nowExisting = new Set(file.mechanisms.map((m) => m.id));
const toAdd = generated.filter((m) => !nowExisting.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
if (toAdd.length === 0) { console.log("无改动"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
