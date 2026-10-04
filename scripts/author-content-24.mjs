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

// D2 规则键（passive 声明 → ruleModifiers 读取）。
const traits = [
  { name: "煤渣草", key: "status.burnGrow", value: true, note: "在场时所有灼烧的衰减变为增长" },
  { name: "焰色反应", key: "status.burnToPoison", value: true, note: "在场时衰减的灼烧转为等量中毒" },
  { name: "双向光速", key: "turnEnd.extra", value: true, note: "在场时双方回合结束效果额外触发 1 次" },
  { name: "陨落", key: "turnEnd.skip", value: true, note: "在场时双方回合结束效果不触发" },
  { name: "戏耍", key: "heal.redirectToDamage", value: true, note: "自己无法回复生命，回复改为敌方等量扣血" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, key, value, note } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  const full = { ownerType: "trait", ownerId: sprites[0], trigger: "passive", when: [SELF(name)], effects: [{ type: "setRuleModifier", target: "self", key, value }], note: `特性「${name}」：${note}` };
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
