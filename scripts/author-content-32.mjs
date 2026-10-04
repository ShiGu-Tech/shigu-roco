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
const LETHAL = { path: "self.counters.incomingLethal", op: "gte", value: 1 };

const clears = (stats) => stats.map((s) => ({ type: "clearStat", target: "self", stat: s, polarity: "buff" }));
const buff = (s) => ({ type: "modifyStat", target: "self", stat: s, mode: "percent", value: 50 });

const traitDefs = [
  { name: "预警", defs: [
    { trigger: "turnStart", when: [SELF("预警"), LETHAL], effects: [buff("speed")], note: "若敌方技能足够击败自己，回合开始速度 +50" },
    { trigger: "turnEnd", when: [SELF("预警")], effects: clears(["speed"]), note: "回合末清除速度加成" },
  ] },
  { name: "先知", defs: [
    { trigger: "turnStart", when: [SELF("先知"), LETHAL], effects: [buff("speed"), buff("atk"), buff("spatk")], note: "若敌方技能足够击败自己，回合开始速度 +50、双攻 +50%" },
    { trigger: "turnEnd", when: [SELF("先知")], effects: clears(["speed", "atk", "spatk"]), note: "回合末清除加成" },
  ] },
  { name: "哨兵", defs: [
    { trigger: "turnStart", when: [SELF("哨兵"), LETHAL], effects: [buff("speed")], note: "若敌方技能足够击败自己，回合开始速度 +50" },
    { trigger: "actionResolved", when: [SELF("哨兵"), LETHAL], effects: [{ type: "forceSwitch", target: "self" }], note: "行动后脱离" },
    { trigger: "turnEnd", when: [SELF("哨兵")], effects: clears(["speed"]), note: "回合末清除速度加成" },
  ] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
for (const { name, defs } of traitDefs) {
  const sprites = byName.get(name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", name); continue; }
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  defs.forEach((d, i) => {
    const full = { ownerType: "trait", ownerId: sprites[0], trigger: d.trigger, when: d.when, effects: d.effects, note: `特性「${name}」：${d.note}` };
    if (i === 0 && ph) { Object.assign(ph, full); patched++; return; }
    let id = `trait:${sprites[0]}`, n = 2;
    while (mechs.some((m) => m.id === id)) id = `trait:${sprites[0]}#${n++}`;
    mechs.push({ id, ...full }); added++;
  });
}
console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
