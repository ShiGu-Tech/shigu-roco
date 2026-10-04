// 第四期 · 守望星（星陨印记半消耗）。
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
const mechs = file.mechanisms;
const ids = byName.get("守望星");
if (!ids?.length) { console.log("! 未找到特性 守望星"); process.exit(0); }
const full = { ownerType: "trait", ownerId: ids[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: ids }], effects: [{ type: "setRuleModifier", target: "self", key: "mark.consumeHalf", value: true }], note: "特性「守望星」：触发星陨印记时仅消耗一半层数，仍按满层结算伤害" };
const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith("特性「守望星」"));
let patched = 0, added = 0;
if (ph) { Object.assign(ph, full); patched++; } else { mechs.push({ id: `trait:${ids[0]}`, ...full }); added++; }
console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
