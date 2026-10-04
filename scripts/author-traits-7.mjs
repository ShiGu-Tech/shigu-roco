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
const SRC = (name) => ({ path: "event.sourceSpriteId", op: "in", value: byName.get(name) ?? [] });
const ELEM = (e) => ({ path: "action.element", op: "eq", value: e });
const BURST = { path: "event.burst", op: "eq", value: true };
const STATUS = (id) => ({ path: "event.statusId", op: "eq", value: id });

const traits = [
  // 状态施加钩子（施加者为持有者）
  { name: "毒牙", trigger: "statusApplied", when: [STATUS("poison"), SRC("毒牙")], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: -40 }, { type: "modifyStat", target: "self", stat: "speed", mode: "flat", value: -40 }], note: "施加中毒时同给物攻/速度 −40" },
  { name: "加个雪球", trigger: "statusApplied", when: [STATUS("freeze"), SRC("加个雪球")], effects: [{ type: "applyStatus", target: "self", statusId: "freeze", layers: 2, immuneElements: ["Ice"] }], note: "施加冻结时 +2 层" },
  { name: "捉迷藏", trigger: "statusApplied", when: [STATUS("freeze"), SRC("捉迷藏")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: 1, mode: "add" }], note: "施加冻结时同给能耗 +1" },
  { name: "抓到了", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("抓到了") ?? [] }], effects: [{ type: "applyStatus", target: "opponent", statusId: "freeze", layers: 2, immuneElements: ["Ice"] }] },
  // 迸发类
  { name: "生物电", trigger: "beforeAction", when: [SELF("生物电"), BURST, ELEM("Electric")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, mode: "add", duration: "nextAction" }] },
  { name: "电流刺激", trigger: "beforeDamage", when: [SELF("电流刺激"), BURST], effects: [{ type: "addPower", value: 40 }] },
  { name: "超负荷", trigger: "beforeAction", when: [SELF("超负荷"), BURST], effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 1, mode: "add", duration: "turns", turns: 1 }], note: "攻击技迸发 → 敌方能耗 +1" },
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
