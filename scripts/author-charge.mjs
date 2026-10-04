import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const sid = (id) => ({ path: "event.action.skillId", op: "eq", value: id });
const NOT_RELEASED = { path: "event.action.released", op: "neq", value: true };
const RELEASED = { path: "event.action.released", op: "eq", value: true };

const skills = [
  {
    id: "sk-7100130",
    name: "吹炎",
    release: [{ type: "dealDamage", target: "target", category: "Physical", power: 170, skillId: "sk-7100130" }],
    note: "应对状态威力翻倍待校准",
  },
  {
    id: "sk-7100140",
    name: "怨力打击",
    release: [{ type: "dealDamage", target: "target", category: "Magic", power: 1, skillId: "sk-7100140" }],
    note: "「蓄力期间受击 → 威力 = 敌方 3 倍」待校准",
  },
  {
    id: "sk-7100150",
    name: "升龙咆哮",
    release: [{ type: "dealDamage", target: "target", category: "Magic", power: 200, skillId: "sk-7100150" }],
  },
  {
    id: "sk-7100160",
    name: "龙之利爪",
    release: [
      { type: "dealDamage", target: "target", category: "Physical", power: 130, skillId: "sk-7100160" },
      { type: "addCounter", target: "self", key: "lifesteal", delta: 0.5 },
    ],
    note: "吸血 50%",
  },
  {
    id: "sk-7100170",
    name: "龙吟",
    release: [
      { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 150 },
      { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 150 },
      { type: "modifyStat", target: "self", stat: "speed", mode: "flat", value: 80 },
    ],
    note: "双攻 +150% 速度 +80",
  },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const s of skills) {
  generated.push({
    id: `skill:${s.id}:charge`,
    ownerType: "skill",
    ownerId: s.id,
    trigger: "beforeAction",
    when: [{ allOf: [sid(s.id), NOT_RELEASED] }],
    effects: [{ type: "beginCharge", skillId: s.id }],
    note: `${s.name}：蓄力（下回合自动释放）`,
  });
  generated.push({
    id: `skill:${s.id}:release`,
    ownerType: "skill",
    ownerId: s.id,
    trigger: "beforeAction",
    when: [{ allOf: [sid(s.id), RELEASED] }],
    effects: s.release,
    note: `${s.name}：蓄力释放${s.note ? "（" + s.note + "）" : ""}`,
  });
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
