// 第四期 · 复生族：不朽（力竭 4 回合后复活）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byTrait = new Map();
for (const sp of catalog.sprites) {
  const n = sp.trait?.name;
  if (!n) continue;
  if (!byTrait.has(n)) byTrait.set(n, []);
  byTrait.get(n).push(sp.id);
}
const ids = (name) => byTrait.get(name) ?? [];

const traitNames = ["不朽"];
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (mechs[i].ownerType === "trait" && traitNames.some((n) => String(mechs[i].note ?? "").startsWith(`特性「${n}」`))) mechs.splice(i, 1);
}

const added = [];
for (const name of traitNames) {
  const s = ids(name);
  if (!s.length) continue;
  added.push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "revive.afterTurns", value: 4 }], note: `特性「${name}」：力竭 4 回合后复活` });
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
