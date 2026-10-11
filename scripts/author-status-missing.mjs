/** 补：33 个空状态技（同 author-status-skills 范式，纯数据）。`--write` 落盘。 */
import fs from "node:fs";
const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const heal = (t, a) => ({ type: "heal", target: t, amount: a, basis: "maxHp" });
const energy = (t, d) => ({ type: "modifyEnergy", target: t, delta: d });
const stat = (t, s, mode, v) => ({ type: "modifyStat", target: t, stat: s, mode, value: v });
const mark = (t, m, l) => ({ type: "applyMark", target: t, markId: m, layers: l });
const counter = (t, k, d) => ({ type: "addCounter", target: t, key: k, delta: d });
const weather = (id, turns) => ({ type: "changeWeather", weatherId: id, turns });
const clear = (t, p) => ({ type: "clearStat", target: t, polarity: p, layers: 99 });
const cost = (t, d, turns) => ({ type: "modifySkillCost", target: t, scope: "all", delta: d, duration: "turns", turns });
const esc = (t) => ({ type: "escape", target: t });
const ded = (t, k, v) => ({ type: "grantDedication", target: t, key: k, value: v, count: 1 });
const unsup = (r) => ({ type: "unsupported", effectType: "statusSkill", reason: r + "【待校准】" });

// [id, name, effects, hits?]
const list = [
  ["sk-7020640", "休息回复", [heal("self", 0.3)]],
  ["sk-7020660", "激怒", [cost("opponent", 3, 3)], "敌方其他技能能耗+3×3回合（本回合技能未排除）"],
  ["sk-7020670", "咆哮", [stat("opponent", "atk", "percent", -60), stat("opponent", "speed", "flat", -60)]],
  ["sk-7020700", "伺机而动", [counter("self", "next-power-add", 70)]],
  ["sk-7021090", "热身运动", [counter("self", "combo-add", 3)]],
  ["sk-7021100", "晒太阳", [clear("opponent", "buff")]],
  ["sk-7030220", "徒长", [energy("self", 10)]],
  ["sk-7030230", "盛开", [counter("self", "power-add", 30)]],
  ["sk-7030240", "根吸收", [heal("self", 0.15), energy("self", 4)]],
  ["sk-7030250", "氧输送", [energy("self", 4), stat("self", "spatk", "percent", 70)]],
  ["sk-7030280", "丰饶", [stat("self", "atk", "percent", 140), stat("self", "spatk", "percent", 140)]],
  ["sk-7030300", "光合作用", [mark("self", "photosynthesis-mark", 1)]],
  ["sk-7030500", "聚盐", [heal("self", 0.08)], "使用后本技能连击数永久+1（未建）", 2],
  ["sk-7040270", "热身", [counter("self", "next-damage-mul", 1)]],
  ["sk-7050250", "落雨", [weather("rain", 8)]],
  ["sk-7050400", "洗礼", [clear("self", "debuff"), cost("self", -1, 3)]],
  ["sk-7060140", "漫反射", [unsup("每种系别至多 1 个技能威力 +35")]],
  ["sk-7060240", "放晴", [unsup("光系技能威力永久 +50%")]],
  ["sk-7080210", "沙涌", [weather("sandstorm", 8)]],
  ["sk-7080380", "蓄势待发", [mark("self", "momentum-mark", 1)]],
  ["sk-7130190", "虫茧", [heal("self", 0.2), ded("self", "lifesteal", 0.1)]],
  ["sk-7130310", "食腐", [unsup("驱散敌方印记，每层回 10% 生命（变量）")]],
  ["sk-7150130", "风起", [mark("self", "wind-mark", 1)]],
  ["sk-7150300", "羽化加速", [counter("self", "power-add", 20), unsup("迅捷")]],
  ["sk-7160160", "生日蛋糕", [clear("self", "debuff"), unsup("自己的增益翻倍")]],
  ["sk-7160200", "甜心续航", [unsup("双方萌化：回复 40% 生命")]],
  ["sk-7170130", "恶作剧", [energy("opponent", -3)]],
  ["sk-7170140", "降灵", [mark("opponent", "spirit-mark", 1)]],
  ["sk-7170250", "勾魂", [energy("opponent", -3), energy("self", 3)]],
  ["sk-7180160", "贪婪", [counter("self", "lifesteal", 1)]],
  ["sk-7180170", "力量吞噬", [counter("opponent", "power-add", -20), counter("self", "power-add", 20)]],
  ["sk-7180190", "恶意逃离", [esc("self")]],
  ["sk-7180320", "暗箱操作", [stat("self", "atk", "percent", -50), stat("self", "spatk", "percent", -50), stat("self", "defense", "percent", -50), stat("self", "spdef", "percent", -50)]],
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const upsert = (mech) => {
  const cur = file.mechanisms.find((m) => m.id === mech.id);
  if (cur) Object.assign(cur, mech);
  else file.mechanisms.push(mech);
};
let added = 0, updated = 0;
for (const [id, name, effects, note, hits] of list) {
  const mech = {
    id: `skill:${id}`, ownerType: "skill", ownerId: id, trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: id }],
    effects,
    note: `${name}：${note ?? ""}`.trim(),
  };
  if (file.mechanisms.some((m) => m.id === mech.id)) updated++; else added++;
  upsert(mech);
  if (hits) {
    const h = {
      id: `skill:${id}:hits`, ownerType: "skill", ownerId: id, trigger: "beforeDamage",
      when: [{ path: "event.action.skillId", op: "eq", value: id }],
      effects: [{ type: "setHits", hits }], note: `${name}：${hits} 连击`,
    };
    upsert(h);
  }
}
console.log(`更新 ${updated} 条 / 新增 ${added} 条（共 ${list.length} 技能）`);
if (write) {
  const [a, b] = String(file.version).split(".").map(Number);
  file.version = `${a}.${b + 1}.0`;
  file.updatedAt = "2026-10-11";
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`已写入（version ${file.version}，共 ${file.mechanisms.length}）`);
} else console.log("dry-run");
