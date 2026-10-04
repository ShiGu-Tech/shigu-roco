// 第四期 · 血脉/日期族：稀兽花宝（按血脉入场）/ 泛音列（聒噪）/ 张弛有度（周末）。
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
const ids = (name) => byTrait.get(name) ?? [];

const traitNames = ["稀兽花宝", "泛音列", "张弛有度"];
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (mechs[i].ownerType === "trait" && traitNames.some((n) => String(mechs[i].note ?? "").startsWith(`特性「${n}」`))) mechs.splice(i, 1);
}

const added = [];
const push = (m) => added.push(m);

// 稀兽花宝：入口按自身血脉施加不同效果（自身增益 / 对敌减益）。
{
  const s = ids("稀兽花宝");
  if (s.length) {
    const self = {
      GRASS: [{ type: "heal", target: "self", amount: 0.2, basis: "maxHp" }],
      WATER: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, duration: "permanent" }],
      WING: [{ type: "addCounter", target: "self", key: "hits-add", delta: 3 }],
      COMMON: [{ type: "addCounter", target: "self", key: "power-add", delta: 40 }],
      FIGHT: [{ type: "addCounter", target: "self", key: "pct-atk", delta: 0.8 }],
      LIGHT: [{ type: "addCounter", target: "self", key: "pct-spatk", delta: 0.8 }],
      MECHANIC: [{ type: "addCounter", target: "self", key: "pct-defense", delta: 0.6 }, { type: "addCounter", target: "self", key: "pct-spdef", delta: 0.6 }],
      ELECTRIC: [{ type: "addCounter", target: "self", key: "flat-speed", delta: 100 }],
      DEMON: [{ type: "addCounter", target: "self", key: "lifesteal", delta: 0.5 }],
    };
    const foe = {
      GHOST: [{ type: "modifyEnergy", target: "opponent", delta: -2 }],
      MOE: [{ type: "addCounter", target: "opponent", key: "pct-atk", delta: -0.6 }, { type: "addCounter", target: "opponent", key: "pct-spatk", delta: -0.6 }],
      INSECT: [{ type: "addCounter", target: "opponent", key: "pct-defense", delta: -0.8 }],
      DRAGON: [{ type: "addCounter", target: "opponent", key: "pct-spdef", delta: -0.8 }],
      STONE: [{ type: "addCounter", target: "opponent", key: "flat-speed", delta: -60 }, { type: "addCounter", target: "opponent", key: "hits-add", delta: -3 }],
      FIRE: [{ type: "applyStatus", target: "opponent", statusId: "burn", layers: 6 }],
      ICE: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 2 }],
      TOXIC: [{ type: "applyStatus", target: "opponent", statusId: "poison", layers: 2 }],
      PHANTOM: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 2 }],
    };
    for (const [bloodline, effects] of Object.entries(self)) push({ id: `trait:${s[0]}#bl-${bloodline.toLowerCase()}`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }, { path: "self.active.bloodline", op: "eq", value: bloodline }], effects, note: `特性「稀兽花宝」：血脉 ${bloodline} 入场效果` });
    for (const [bloodline, effects] of Object.entries(foe)) push({ id: `trait:${s[0]}#bl-${bloodline.toLowerCase()}`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }, { path: "self.active.bloodline", op: "eq", value: bloodline }], effects, note: `特性「稀兽花宝」：血脉 ${bloodline} 入场效果` });
  }
}
// 泛音列：使用状态技能后，敌方获得「聒噪」——攻击技能能耗 +2，持续 3 回合。
{
  const s = ids("泛音列");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "actionResolved", when: [{ path: "self.active.spriteId", op: "in", value: s }, { path: "event.action.actionType", op: "eq", value: "Status" }], effects: [{ type: "modifySkillCost", target: "opponent", scope: "attack", delta: 2, duration: "turns", turns: 3, dispellable: true }], note: "特性「泛音列」：使用状态技能后敌方获得「聒噪」（攻击技能能耗 +2，3 回合）" });
}
// 张弛有度：周末双攻 +40%，其余时间双防 +40%。
{
  const s = ids("张弛有度");
  if (s.length) push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "weekend.boost", value: true }], note: "特性「张弛有度」：周末双攻 +40%，其余时间双防 +40%" });
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
