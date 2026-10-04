// 第四期 · 能量/能耗族：基因编辑 / 盗魂铃。
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

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
let mechs = file.mechanisms;

// 移除旧占位（特性名匹配）。
for (let i = mechs.length - 1; i >= 0; i--) {
  const note = String(mechs[i].note ?? "");
  if (mechs[i].ownerType === "trait" && (/^特性「基因编辑」/.test(note) || /^特性「盗魂铃」/.test(note))) mechs.splice(i, 1);
}

const geneIds = byName.get("基因编辑") ?? [];
const soulIds = byName.get("盗魂铃") ?? [];
const added = [];

if (geneIds.length) {
  added.push({ id: `trait:${geneIds[0]}#gene`, ownerType: "trait", ownerId: geneIds[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: geneIds }], effects: [{ type: "setRuleModifier", target: "self", key: "cost.lastTurnSum", value: true }], note: "特性「基因编辑」：自己携带技能的基础能耗变为上回合双方使用技能能耗之和" });
}
if (soulIds.length) {
  added.push({ id: `trait:${soulIds[0]}#soul-entry`, ownerType: "trait", ownerId: soulIds[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: soulIds }, { not: { path: "self.active.counters.soulInit", op: "gte", value: 1 } }], effects: [
    { type: "setCounter", target: "self", key: "soulInit", value: 1 },
    { type: "setEnergy", target: "self", value: 0 },
    { type: "modifyEnergy", target: "self", delta: 0, deltaFrom: { path: "opponent.counters.charges", scale: 5 } },
  ], note: "特性「盗魂铃」：初始能量为 0；首次入场前敌方每聚能 1 次回复 5 能量" });
  added.push({ id: `trait:${soulIds[0]}#soul-rule`, ownerType: "trait", ownerId: soulIds[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: soulIds }], effects: [{ type: "setRuleModifier", target: "self", key: "energy.gainReduce", value: 4 }], note: "特性「盗魂铃」：在场时自己回复的能量 −4" });
}

mechs.push(...added);
console.log(`add ${added.length}`);
if (!added.length) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
