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

// P5 系别 / 环境条件。
const traits = [
  { name: "涂鸦", def: { trigger: "beforeDamage", when: [SELF("涂鸦"), { not: { path: "self.active.element", op: "contains", valueFrom: "action.element" } }], effects: [{ type: "modifyDamage", target: "self", mode: "multiply", value: 1.5, scope: "outgoing" }], note: "使用非本系技能时威力 +50%" } },
  { name: "绝对秩序", def: { trigger: "beforeDamage", when: [TARGET("绝对秩序"), { not: { path: "opponent.active.element", op: "contains", valueFrom: "action.element" } }], effects: [{ type: "setDamageReduction", target: "target", percent: 50 }], note: "受到非敌方系别技能攻击时伤害 −50%" } },
  { name: "流沙统治者", def: { trigger: "onEntry", when: [ENTER("流沙统治者"), { path: "state.weather.id", op: "eq", value: "sandstorm" }], effects: [{ type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 50 }], note: "沙暴天气下入场获速度 +50%" } },
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
