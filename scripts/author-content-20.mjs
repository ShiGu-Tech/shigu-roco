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

// P6 槽位限制（`legalActions` 读 passive 覆盖的 `battle.allowedSlots` 位掩码：bit0=1号位）。
const traits = [
  { name: "正位宝剑", mask: 1, note: "仅可使用 1 号位技能" },
  { name: "宝剑王牌", mask: 1 | 4, note: "仅可使用 1 号位和 3 号位技能" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, mask, note } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  const full = { ownerType: "trait", ownerId: sprites[0], trigger: "passive", when: [SELF(name)], effects: [{ type: "setRuleModifier", target: "self", key: "battle.allowedSlots", value: mask }], note: `特性「${name}」：${note}` };
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
