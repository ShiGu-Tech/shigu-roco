// 第四期 · 换碟精确定值：音波弹+15 / 音爆+20 / 金属噪音+20 / 午夜噪音+5（海报「真爱精灵PVE 028 音碟吼」）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const traitIds = (name) => catalog.sprites.filter((s) => s.trait?.name === name).map((s) => s.id);

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;

// 清理旧换碟条目（含上一批 +30 通用加成）。
for (let i = mechs.length - 1; i >= 0; i--) {
  const note = String(mechs[i].note ?? "");
  if (note.startsWith("特性「换碟」")) mechs.splice(i, 1);
}

const POWER = { "sk-7020890": 15, "sk-7020410": 20, "sk-7070130": 20, "sk-7170210": 5 };
const NAMES = { "sk-7020890": "音波弹", "sk-7020410": "音爆", "sk-7070130": "金属噪音", "sk-7170210": "午夜噪音" };

const added = [];
const s = traitIds("换碟");
if (s.length) {
  for (const [skillId, value] of Object.entries(POWER)) {
    added.push({ id: `trait:${s[0]}#c57-power-${skillId}`, ownerType: "trait", ownerId: s[0], trigger: "beforeDamage", when: [{ path: "event.skillId", op: "eq", value: skillId }], effects: [{ type: "addPower", target: "self", value }], note: `特性「换碟」：${NAMES[skillId]}威力 +${value}` });
  }
  const ids = Object.keys(POWER);
  added.push({ id: `trait:${s[0]}#c57-improv`, ownerType: "trait", ownerId: s[0], trigger: "skillUsed", when: [{ path: "event.skillId", op: "in", value: ids }], effects: [{ type: "randomizeSkill", target: "self", skillIdFrom: "event.skillId", sourceFrom: "sameElement", costDelta: -1 }], note: "特性「换碟」：上述技能获得巧变：同系别技能（用后变为同系随机技能且能耗 −1）" });
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) {
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`);
} else console.log("dry-run");
