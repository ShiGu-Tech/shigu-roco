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
const WEATHER = (id) => ({ path: "state.weather.id", op: "eq", value: id });
const ELEM = (e) => ({ path: "event.element", op: "eq", value: e });

const traits = [
  // 天气条件
  { name: "冰雪魂魄", trigger: "beforeDamage", when: [SELF("冰雪魂魄"), WEATHER("blizzard"), ELEM("Ice")], effects: [{ type: "modifyDamage", mode: "multiply", value: 2, scope: "outgoing" }] },
  { name: "滴眼液", trigger: "skillUsed", when: [SELF("滴眼液"), WEATHER("rain"), ELEM("Water")], effects: [{ type: "addCounter", target: "self", key: "lifesteal", delta: 0.5 }] },
  { name: "电子音乐", trigger: "skillUsed", when: [SELF("电子音乐"), WEATHER("thunder"), ELEM("Electric")], effects: [{ type: "applyStatus", target: "opponent", statusId: "conductive-charge", layers: 1, immuneElements: ["Electric"] }] },
  { name: "得寸进尺", trigger: "beforeDamage", when: [SELF("得寸进尺"), WEATHER("rain")], effects: [{ type: "modifyDamage", mode: "multiply", value: 2, scope: "outgoing" }], note: "双攻 +100% 近似为伤害 ×2" },
  // 造成克制伤害后
  { name: "最好的伙伴", trigger: "afterDamage", when: [SELF("最好的伙伴"), { path: "event.effectiveness", op: "gt", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 20 }, { type: "modifyEnergy", target: "self", delta: 2 }] },
  { name: "裁决", trigger: "afterDamage", when: [SELF("裁决"), { path: "event.effectiveness", op: "gt", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 20 }, { type: "modifyEnergy", target: "self", delta: 2 }], note: "首个技能替换光系愿力冲击待校准" },
  { name: "点燃", trigger: "afterDamage", when: [SELF("点燃"), { path: "event.effectiveness", op: "gt", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 20 }, { type: "modifyEnergy", target: "self", delta: 2 }], note: "首个技能替换火系愿力冲击待校准" },
  { name: "净化", trigger: "afterDamage", when: [SELF("净化"), { path: "event.effectiveness", op: "gt", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 20 }, { type: "modifyEnergy", target: "self", delta: 2 }], note: "首个技能替换水系愿力冲击待校准" },
  { name: "滋养", trigger: "afterDamage", when: [SELF("滋养"), { path: "event.effectiveness", op: "gt", value: 1 }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "speed", mode: "percent", value: 20 }, { type: "modifyEnergy", target: "self", delta: 2 }], note: "首个技能替换草系愿力冲击待校准" },
  // 应对成功后
  { name: "指挥家", trigger: "skillUsed", when: [SELF("指挥家"), { path: "event.reacted", op: "eq", value: true }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 30 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 30 }] },
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

console.log(`生成 ${generated.length} 条，新增 ${generated.length} 条`);
if (generated.length === 0) { console.log("无新增"); process.exit(0); }
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
