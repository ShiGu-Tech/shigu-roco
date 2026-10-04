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
const COST = (v) => ({ path: "action.cost", op: "eq", value: v });
const DEF = { path: "action.category", op: "eq", value: "Defense" };

const traits = [
  { name: "三鼓作气", trigger: "skillUsed", when: [SELF("三鼓作气"), COST(3)], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 20 }] },
  { name: "奔波命", trigger: "skillUsed", when: [SELF("奔波命"), DEF], effects: [{ type: "escape", target: "self" }], note: "回合末脱离近似为立即" },
  { name: "防过载保护", trigger: "actionResolved", when: [SELF("防过载保护")], effects: [{ type: "escape", target: "self" }] },
  { name: "咔咔冲刺", trigger: "skillUsed", when: [SELF("咔咔冲刺"), { path: "event.wentFirst", op: "eq", value: true }], effects: [{ type: "addCounter", target: "self", key: "combo-add", delta: 1 }] },
  { name: "拉拉队长", trigger: "statusApplied", when: [{ path: "event.statusId", op: "eq", value: "moe" }, SELF("拉拉队长")], effects: [{ type: "removeStatus", target: "self", statusId: "moe" }], note: "萌化状态下再获得萌化 → 解除" },
  { name: "斗技", trigger: "skillUsed", when: [SELF("斗技"), { path: "event.reacted", op: "eq", value: true }], effects: [{ type: "addCounter", target: "self", key: "power-all", delta: 30 }], note: "应对成功后全技能威力永久 +30" },
  { name: "斗技-b", traitName: "斗技", trigger: "beforeDamage", when: [SELF("斗技"), { path: "self.active.counters.power-all", op: "gte", value: 1 }], effects: [{ type: "addPower", value: 0, valueFrom: { path: "self.active.counters.power-all" } }] },
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
