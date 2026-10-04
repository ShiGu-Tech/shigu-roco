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
const ELEM = (e) => ({ path: "event.element", op: "eq", value: e });
const SLOT_IN = (arr) => ({ path: "action.slot", op: "in", value: arr });
const LAST_ELEM = (e) => ({ anyOf: [{ path: "self.lastTurn.element", op: "eq", value: e }, { path: "opponent.lastTurn.element", op: "eq", value: e }] });

const traits = [
  // 技能位置
  { name: "向心力", trigger: "beforeDamage", when: [SELF("向心力"), SLOT_IN([1, 2])], effects: [{ type: "addPower", value: 30 }], note: "1/2 号位威力 +30（传动待校准）" },
  { name: "贪心算法", trigger: "skillUsed", when: [SELF("贪心算法"), SLOT_IN([1])], effects: [{ type: "applyStatus", target: "opponent", statusId: "burn", layers: 6, immuneElements: ["Fire"] }], note: "1 号位使用后敌方 6 层灼烧（传动待校准）" },
  { name: "盲拧", trigger: "beforeAction", when: [SELF("盲拧"), SLOT_IN([4])], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -4, mode: "add", duration: "nextAction" }], note: "4 号位能耗 −4（打乱顺序待校准）" },
  // 上回合双方使用某系
  { name: "冷光源", trigger: "beforeDamage", when: [SELF("冷光源"), ELEM("Ice"), LAST_ELEM("Wing")], effects: [{ type: "modifyDamage", mode: "multiply", value: 2, scope: "outgoing" }] },
  { name: "热成像", trigger: "beforeDamage", when: [SELF("热成像"), ELEM("Insect"), LAST_ELEM("Fire")], effects: [{ type: "modifyDamage", mode: "multiply", value: 2, scope: "outgoing" }] },
  // 击败
  { name: "恶魔的晚宴", trigger: "afterDeath", when: [TARGET("恶魔的晚宴")], effects: [{ type: "modifyStat", target: "opponent", stat: "atk", mode: "percent", value: 50 }, { type: "modifyStat", target: "opponent", stat: "spatk", mode: "percent", value: 50 }], note: "主动击败（killer=target 侧）永久双攻 +50%" },
  // 应对成功后
  { name: "思维之盾", trigger: "skillUsed", when: [SELF("思维之盾"), { path: "event.reacted", op: "eq", value: true }], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -5, mode: "add", duration: "nextAction" }] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const t of traits) {
  const sprites = byName.get(t.name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", t.name); continue; }
  let id = `trait:${sprites[0]}`;
  let i = 2;
  while (existing.has(id) || generated.some((g) => g.id === id)) id = `trait:${sprites[0]}#${i++}`;
  generated.push({ id, ownerType: "trait", ownerId: sprites[0], trigger: t.trigger, when: t.when, effects: t.effects, note: `特性「${t.name}」${t.note ? "：" + t.note : ""}` });
}

console.log(`生成 ${generated.length} 条`);
if (generated.length === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
