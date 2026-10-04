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

// D1 治疗 / DoT / 派生计数。
const traits = [
  { name: "嫁祸", def: { trigger: "beforeDamage", when: [SELF("嫁祸")], effects: [{ type: "setCounter", target: "self", key: "combo-add", valueFrom: { path: "self.counters.hpLostQuarters", scale: 2 } }], note: "自己每失去 25% 生命，连击数 +2" } },
  { name: "守护者", def: { trigger: "onEntry", when: [ENTER("守护者")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 0, deltaFrom: { path: "self.counters.teamMoe", scale: -1 }, duration: "permanent", key: "guardian" }], note: "己方每有 1 层萌化，入场时全技能能耗 −1" } },
  { name: "和弦共振", def: { trigger: "beforeDamage", when: [SELF("和弦共振")], effects: [{ type: "addPower", target: "self", value: 0, valueFrom: { path: "self.counters.fieldMarkKinds", scale: 50 } }], note: "双方场上每有 1 种不同印记，魔攻 +50%（近似为固定 +50 威力/种）" } },
  { name: "守护之心", def: { trigger: "beforeDamage", when: [TARGET("守护之心")], effects: [{ type: "setDamageReduction", target: "target", percent: 0, percentFrom: { path: "target.counters.fieldBuffKinds", scale: 20 } }], note: "双方场上每有 1 种不同增益，自己物防 +20%（近似为减伤）" } },
  { name: "耐活王", def: { trigger: "statusDamage", when: [TARGET("耐活王"), { path: "event.ownerId", op: "eq", value: "poison" }], effects: [{ type: "heal", target: "target", amount: 0, amountFrom: { path: "event.value", round: "none" } }], note: "敌方受到中毒伤害时，自己回复等量生命" } },
  { name: "月相", def: { trigger: "statusDamage", when: [TARGET("月相"), { path: "event.ownerId", op: "eq", value: "poison" }], effects: [{ type: "heal", target: "target", amount: 0, amountFrom: { path: "event.value", round: "none" } }], note: "敌方受到中毒伤害时回复等量生命（过量转中毒略）" } },
  { name: "仁心", def: { trigger: "statusDamage", when: [TARGET("仁心"), { path: "event.ownerId", op: "eq", value: "burn" }], effects: [{ type: "heal", target: "target", amount: 0, amountFrom: { path: "event.value", round: "none" } }], note: "敌方受到灼烧伤害时，自己回复等量生命" } },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, def } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  const full = { ownerType: "trait", ownerId: sprites[0], ...def, note: `特性「${name}」：${def.note}` };
  if (ph) { Object.assign(ph, full); patched++; continue; }
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
