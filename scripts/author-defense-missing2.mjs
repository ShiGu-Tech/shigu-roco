/** 补：① 虫群过境 = 2 连击 + 随机奉献；② 剩余 13 个空防御技（同 author-defense-skills 范式）。
 *  幂等：防御技按 skill:<id>:declare/:reduce/:expire；虫群过境改现有条目 + 加 :hits。`--write` 落盘。 */
import fs from "node:fs";
const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const shieldKey = (id) => "def-" + id.replace(/^sk-/, "");

const skills = [
  { id: "sk-7020780", name: "防御", reduce: 70, counter: [] },
  { id: "sk-7020800", name: "血气", reduce: 60, todo: "本回合受到致命伤害时保留 1 血" },
  { id: "sk-7021110", name: "有效预防", reduce: 50, todo: "下一次行动先手 +1" },
  { id: "sk-7030320", name: "酶浓度调整", reduce: 80, counter: [{ type: "heal", target: "self", amount: 0.2, basis: "maxHp" }], counterNote: "自己回复 20% 生命" },
  { id: "sk-7050260", name: "泡沫幻影", reduce: 80, counter: [{ type: "escape", target: "self" }], counterNote: "自己脱离" },
  { id: "sk-7050280", name: "水环", reduce: 60, todo: "自己全技能能耗 -2" },
  { id: "sk-7050420", name: "潮汐", reduce: 60, counter: [{ type: "applyMark", target: "self", markId: "wet-mark", layers: 1 }], counterNote: "自己 1 层湿润印记" },
  { id: "sk-7060150", name: "镜像反射", reduce: 70, todo: "本技能变为被应对的技能" },
  { id: "sk-7080220", name: "刺盾", reduce: 70, counter: [{ type: "modifyStat", target: "opponent", stat: "atk", mode: "percent", value: -70 }], counterNote: "敌方物攻 -70%" },
  { id: "sk-7080250", name: "遁地", reduce: 50, counter: [{ type: "escape", target: "self" }], counterNote: "并脱离" },
  { id: "sk-7080400", name: "淤泥表皮", reduce: 80, counter: [{ type: "addCounter", target: "opponent", key: "combo-add", delta: -3 }], counterNote: "敌方连击数 -3" },
  { id: "sk-7130220", name: "掩护", reduce: 70, counter: [{ type: "escape", target: "self" }], todo: "下个入场精灵获得减伤" },
  { id: "sk-7180330", name: "虚假破产", reduce: 80, todo: "能量不足时消耗 5% 生命代替 1 能量" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];

// ① 虫群过境：固定键 → 随机奉献；并加 2 连击
const swarm = file.mechanisms.find((m) => m.id === "skill:sk-7130120");
if (swarm) {
  swarm.effects = [{ type: "grantDedication", target: "self", count: 1 }];
  swarm.note = "虫群过境：获得 1 次随机奉献";
  console.log("改：skill:sk-7130120 → 随机奉献");
}
if (!existing.has("skill:sk-7130120:hits")) {
  generated.push({
    id: "skill:sk-7130120:hits", ownerType: "skill", ownerId: "sk-7130120", trigger: "beforeDamage",
    when: [{ path: "event.action.skillId", op: "eq", value: "sk-7130120" }],
    effects: [{ type: "setHits", hits: 2 }],
    note: "虫群过境：2 连击",
  });
}

// ② 13 个防御技
for (const s of skills) {
  const key = shieldKey(s.id);
  const counter = [...(s.counter ?? [])];
  if (s.todo) counter.push({ type: "unsupported", effectType: "defenseCounter", reason: `${s.name}：${s.todo}【待校准】` });
  generated.push({
    id: `skill:${s.id}:declare`, ownerType: "skill", ownerId: s.id, trigger: "actionDeclared",
    when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: s.id }, { path: "event.opponentAction.actionType", op: "eq", value: "Attack" }] }],
    effects: [{ type: "forceFirst", target: "self" }, { type: "applyStatus", target: "self", statusId: key, layers: 1 }, ...counter],
    note: `${s.name}：应对攻击成功 → 必定先手 + 本回合承伤 −${s.reduce}%${s.counterNote ? "；" + s.counterNote : ""}`,
  });
  generated.push({
    id: `skill:${s.id}:reduce`, ownerType: "skill", ownerId: s.id, trigger: "beforeDamage",
    when: [{ path: `target.active.statuses.${key}`, op: "gte", value: 1 }],
    effects: [{ type: "setDamageReduction", target: "target", percent: s.reduce }],
    note: `${s.name}：本回合承伤 −${s.reduce}%`,
  });
  generated.push({
    id: `skill:${s.id}:expire`, ownerType: "skill", ownerId: s.id, trigger: "turnEnd",
    when: [{ path: `self.active.statuses.${key}`, op: "gte", value: 1 }],
    effects: [{ type: "removeStatus", target: "self", statusId: key }],
    note: `${s.name}：回合末移除减伤状态`,
  });
}

const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`新增 ${toAdd.length} 条`);
file.mechanisms.push(...toAdd);
if (write) {
  const [a, b] = String(file.version).split(".").map(Number);
  file.version = `${a}.${b + 1}.0`;
  file.updatedAt = "2026-10-11";
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`已写入（version ${file.version}，共 ${file.mechanisms.length}）`);
} else console.log("dry-run：加 --write 落盘");
