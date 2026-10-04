import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 「自己获得全技能威力 +N」类：数据驱动——施加时打计数器，beforeDamage 读计数器加威力（无需改引擎）。
const skills = [
  { id: "sk-7140140", name: "化劲", flag: "power-7140140", power: 40, extra: [] },
  {
    id: "sk-7140280",
    name: "提气",
    flag: "power-7140280",
    power: 40,
    extra: [{ flag: "power-7140280-switch", power: 50, cond: { path: "opponent.switchedThisTurn", op: "eq", value: true } }],
  },
  { id: "sk-7150370", name: "超声波", flag: "power-7150370", power: 20, extra: [] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];

for (const s of skills) {
  generated.push({
    id: `skill:${s.id}`,
    ownerType: "skill",
    ownerId: s.id,
    trigger: "beforeAction",
    when: [{ path: "event.action.skillId", op: "eq", value: s.id }],
    effects: [{ type: "addCounter", target: "self", key: s.flag, delta: 1 }],
    note: `${s.name}：获得全技能威力 +${s.power}（永久，计数器）`,
  });
  generated.push({
    id: `skill:${s.id}:bonus`,
    ownerType: "skill",
    ownerId: s.id,
    trigger: "beforeDamage",
    when: [{ path: `self.active.counters.${s.flag}`, op: "gte", value: 1 }],
    effects: [{ type: "addPower", value: s.power }],
    note: `${s.name}：全技能威力 +${s.power}`,
  });
  for (const e of s.extra) {
    generated.push({
      id: `skill:${s.id}:${e.flag}`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "beforeAction",
      when: [{ allOf: [{ path: "event.action.skillId", op: "eq", value: s.id }, e.cond] }],
      effects: [{ type: "addCounter", target: "self", key: e.flag, delta: 1 }],
      note: `${s.name}：额外全技能威力 +${e.power}`,
    });
    generated.push({
      id: `skill:${s.id}:${e.flag}:bonus`,
      ownerType: "skill",
      ownerId: s.id,
      trigger: "beforeDamage",
      when: [{ path: `self.active.counters.${e.flag}`, op: "gte", value: 1 }],
      effects: [{ type: "addPower", value: e.power }],
      note: `${s.name}：额外全技能威力 +${e.power}`,
    });
  }
}

const toAdd = generated.filter((m) => !existing.has(m.id));
console.log(`生成 ${generated.length} 条，新增 ${toAdd.length} 条`);
if (toAdd.length === 0) { console.log("无新增"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
