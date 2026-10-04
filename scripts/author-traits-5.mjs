import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const name = sp.trait?.name;
  if (!name) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(sp.id);
}
const SELF = (name) => ({ path: "self.active.spriteId", op: "in", value: byName.get(name) ?? [] });
const TARGET = (name) => ({ path: "target.active.spriteId", op: "in", value: byName.get(name) ?? [] });
const EMPTY = { path: "self.active.energy", op: "lte", value: 0 };

const traits = [
  { name: "付给恶魔的赎价", trigger: "afterDeath", when: [TARGET("付给恶魔的赎价")], effects: [{ type: "modifyMagic", target: "opponent", delta: -1 }], note: "击败敌方 → 敌方额外 −1 魔力" },
  { name: "付给恶魔的赎价-b", traitName: "付给恶魔的赎价", trigger: "afterDeath", when: [SELF("付给恶魔的赎价")], effects: [{ type: "modifyMagic", target: "self", delta: -1 }], note: "被击败 → 自己额外 −1 魔力" },
  { name: "虚假宝箱", trigger: "afterDeath", when: [SELF("虚假宝箱")], effects: [{ type: "modifyStat", target: "opponent", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "opponent", stat: "defense", mode: "percent", value: 20 }], note: "自己力竭 → 敌方攻防 +20%" },
  { name: "上锁", trigger: "actionDeclared", when: [SELF("上锁")], effects: [{ type: "modifyCooldown", target: "opponent", skillIdFrom: "event.opponentAction.skillId", delta: 1 }] },
  { name: "警惕", trigger: "turnEnd", when: [SELF("警惕"), EMPTY], effects: [{ type: "escape", target: "self" }] },
  { name: "莫比乌斯", trigger: "turnEnd", when: [SELF("莫比乌斯"), EMPTY], effects: [{ type: "modifyEnergy", target: "self", delta: 10 }] },
  { name: "守望者", trigger: "skillUsed", when: [SELF("守望者"), { path: "event.reacted", op: "eq", value: true }], effects: [{ type: "applyStatus", target: "opponent", statusId: "moe", layers: 1 }], note: "防御应对成功分支待校准" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const t of traits) {
  const sprites = byName.get(t.traitName ?? t.name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", t.name); continue; }
  let id = `trait:${sprites[0]}`;
  let i = 2;
  while (existing.has(id) || generated.some((g) => g.id === id)) id = `trait:${sprites[0]}#${i++}`;
  generated.push({ id, ownerType: "trait", ownerId: sprites[0], trigger: t.trigger, when: t.when, effects: t.effects, note: `特性「${t.traitName ?? t.name}」${t.note ? "：" + t.note : ""}` });
}

console.log(`生成 ${generated.length} 条`);
if (generated.length === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
