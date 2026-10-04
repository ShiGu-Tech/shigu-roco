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
const IDS = (n) => byName.get(n) ?? [];
const FROM = (n) => ({ path: "event.from", op: "in", value: IDS(n) });
const TGT = (n) => ({ path: "target.active.spriteId", op: "in", value: IDS(n) });

// P7 离场 / 换入域 + P8 累计长尾。
const traits = [
  { name: "迎宾", def: { trigger: "afterSwitch", when: [{ anyOf: [FROM("迎宾"), TGT("迎宾")] }], effects: [{ type: "applyStatus", target: "self", statusId: "moe", layers: 1 }], note: "有精灵离场时，换入的精灵获得 1 层萌化" } },
  { name: "木桶戏法", def: { trigger: "afterSwitch", when: [FROM("木桶戏法")], effects: [{ type: "applyStatus", target: "self", statusId: "wooden-barrel-state", layers: 1 }], note: "离场后换入的精灵以木桶状态登场" } },
  { name: "整点报时", def: { trigger: "turnEnd", when: [SELF("整点报时"), { path: "self.counters.energySpent", op: "eq", value: 12 }, { path: "self.counters.reportDone", op: "neq", value: 1 }], effects: [
    { type: "addCounter", target: "self", key: "reportDone", delta: 1 },
    { type: "modifyEnergy", target: "self", delta: 100 },
    { type: "heal", target: "self", basis: "maxHp", amount: 1 },
  ], note: "每场 1 次：累计消耗恰好 12 能量时回满能量与生命（能量近似为 +100）" } },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, def } of traits) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  const full = { ownerType: "trait", ownerId: sprites[0], ...def, note: `特性「${name}」：${def.note}` };
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
