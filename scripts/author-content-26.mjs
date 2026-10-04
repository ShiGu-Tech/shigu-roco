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
const FROM = (n) => ({ path: "event.from", op: "in", value: byName.get(n) ?? [] });

// D4 效果原语：侵蚀 / 共鸣 / 齐鸣 / 营养液泡 / 衡量 / 洁癖 / 孤傲。
const traits = [
  { name: "侵蚀", def: { trigger: "beforeDamage", when: [SELF("侵蚀")], effects: [{ type: "setCounter", target: "self", key: "combo-add", valueFrom: { path: "target.active.statuses.poison", scale: 1 } }], note: "敌方每有 1 层中毒，连击数 +1" } },
  { name: "共鸣", def: { trigger: "beforeDamage", when: [SELF("共鸣"), { path: "action.skillId", op: "eq", value: "sk-7130160" }], effects: [{ type: "addPower", target: "self", value: 20 }], note: "携带的「虫鸣」技能威力 +20" } },
  { name: "齐鸣", def: { trigger: "beforeDamage", when: [SELF("齐鸣"), { path: "action.skillId", op: "eq", value: "sk-7130160" }], effects: [{ type: "addPower", target: "self", value: 20 }], note: "虫鸣威力 +20（队友巧变：虫鸣略）" } },
  { name: "营养液泡", oncePerTurn: true, def: { trigger: "buffGained", when: [SELF("营养液泡")], effects: [{ type: "modifyStat", target: "self", stat: "", statFrom: "event.stat", mode: "flat", value: 0.2 }], note: "获得增益时额外获得 2 层" } },
  { name: "衡量", oncePerTurn: true, def: { trigger: "buffGained", when: [TARGET("衡量")], effects: [{ type: "modifyStat", target: "target", stat: "", statFrom: "event.stat", mode: "flat", value: 0, valueFrom: "event.value" }], note: "在场时敌方获得增益自己也获得" } },
  { name: "衡量#entry", extra: true, def: { trigger: "onEntry", when: [ENTER("衡量")], effects: [{ type: "copyStat", target: "self", from: "opponent", polarity: "buff" }], note: "入场时复制敌方增益" } },
  { name: "洁癖", def: { trigger: "afterSwitch", when: [FROM("洁癖")], effects: [{ type: "inheritStat", target: "self", polarity: "all" }], note: "离场后增益 / 减益由换入精灵继承" } },
  { name: "孤傲", def: { trigger: "afterSwitch", when: [TARGET("孤傲")], effects: [{ type: "inheritStat", target: "self", polarity: "all" }], note: "敌方精灵离场后其增益 / 减益由换入精灵继承" } },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, def, extra, oncePerTurn } of traits) {
  const base = name.replace(/#.*$/, "");
  const sprites = byName.get(base);
  if (!sprites?.length) { console.log("  ! 未找到特性:", base); continue; }
  const full = { ownerType: "trait", ownerId: sprites[0], ...def, note: `特性「${base}」：${def.note}` };
  if (oncePerTurn) full.oncePerTurn = true;
  if (!extra) {
    const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${base}」`));
    if (ph) { Object.assign(ph, full); patched++; continue; }
  }
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
