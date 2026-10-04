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
const ENTER = (name) => ({ path: "event.enteredSpriteId", op: "in", value: byName.get(name) ?? [] });
const ELEM = (e) => ({ path: "action.element", op: "eq", value: e });

const traits = [
  { name: "毒腺", trigger: "skillUsed", when: [SELF("毒腺"), { path: "action.cost", op: "lte", value: 1 }], effects: [{ type: "applyStatus", target: "opponent", statusId: "poison", layers: 4, immuneElements: ["Grass"] }] },
  { name: "构装契约者", trigger: "onEntry", when: [ENTER("构装契约者"), { path: "opponent.magic", op: "eq", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 100 }, { type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 100 }] },
  { name: "图书守卫者", trigger: "onEntry", when: [ENTER("图书守卫者"), { path: "self.magic", op: "eq", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 100 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 100 }] },
  { name: "鼓气", trigger: "skillUsed", when: [SELF("鼓气"), { path: "action.cost", op: "eq", value: 3 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 20 }] },
  { name: "特殊清洁场景", trigger: "turnEnd", when: [SELF("特殊清洁场景")], effects: [{ type: "transferMark", amount: 1, from: "opponent", to: "self" }], note: "偷取敌方 1 层印记" },
  { name: "振奋虫心", trigger: "afterDeath", when: [TARGET("振奋虫心")], effects: [{ type: "grantDedication", target: "opponent", count: 5 }], note: "主动击败（killer=target 侧）→ 队伍 5 次随机奉献" },
  { name: "安可", trigger: "skillUsed", when: [SELF("安可"), ELEM("Light")], effects: [{ type: "escape", target: "self" }], note: "使用光系后回合末返场（近似立即）" },
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
