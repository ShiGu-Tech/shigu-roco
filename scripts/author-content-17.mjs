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

// P3 状态 / 印记改写：印记层数钩子 + 印记收拢 + 灼烧/中毒转化。
const marks = [
  { mark: "dragon-devour-mark", def: { trigger: "skillUsed", when: [{ path: "self.active.marks.dragon-devour-mark", op: "gte", value: 1 }, { path: "event.cost", op: "gte", value: 3 }], effects: [
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 40 },
    { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 40 },
  ], note: "龙噬印记：释放 ≥3 能耗技能后获得双攻 +40%" } },
  { mark: "sprout-mark", def: { trigger: "buffGained", when: [{ path: "self.active.marks.sprout-mark", op: "gte", value: 1 }], effects: [{ type: "applyMark", target: "self", markId: "sprout-mark", layers: 1 }], note: "萌芽印记：获得增益时额外 +1 层" } },
];

const traits = [
  { name: "与星星同行", def: { trigger: "beforeDamage", when: [SELF("与星星同行")], effects: [{ type: "transformMark", target: "opponent", toMarkId: "starfall-mark", scope: "sprite" }], note: "攻击时将敌方所有印记收拢为相同层数的星陨印记" } },
  { name: "月牙雪糕", def: { trigger: "beforeDamage", when: [SELF("月牙雪糕"), { path: "target.active.statuses.freeze", op: "gte", value: 1 }], effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layersFrom: { path: "target.active.statuses.freeze", scale: 1 } }], note: "攻击前敌方每层冻结使其获 1 层星陨印记" } },
  { name: "蚀刻", def: { trigger: "turnEnd", when: [SELF("蚀刻")], effects: [{ type: "setMark", target: "opponent", markId: "poison-mark", layersFrom: { path: "opponent.active.statuses.poison", terms: [{ coef: 0.5, power: 1 }] } }], note: "回合末敌方每 2 层中毒转为 1 层中毒印记" } },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
const patchOrAdd = (matchFn, ownerType, ownerId, def) => {
  const ph = mechs.find(matchFn);
  if (ph) { Object.assign(ph, { ownerType, ownerId, ...def }); patched++; return; }
  let id = `${ownerType}:${ownerId}`, n = 2;
  while (mechs.some((m) => m.id === id)) id = `${ownerType}:${ownerId}#${n++}`;
  mechs.push({ id, ownerType, ownerId, ...def }); added++;
};

for (const { mark, def } of marks) {
  patchOrAdd((m) => m.ownerType === "mark" && m.ownerId === mark, "mark", mark, def);
}
for (const { name, def } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  patchOrAdd((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`), "trait", sprites[0], { ...def, note: `特性「${name}」：${def.note}` });
}

console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
