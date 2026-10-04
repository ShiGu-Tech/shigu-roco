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

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;

function patchSkill(skillId, effects, note) {
  const m = mechs.find((x) => x.id.startsWith(`skill:${skillId}`) && x.effects.some((e) => e.type === "unsupported"));
  if (!m) { console.log("  ! 未找到技能机制:", skillId); return; }
  m.effects = effects;
  if (note) m.note = note;
  patched++;
}

// P4 增益/减益改写（技能）：
patchSkill("sk-7120130", [{ type: "convertBuffToStatus", target: "opponent", statusId: "poison", factor: 1 }], "毒雾：敌方增益转为等量中毒");
patchSkill("sk-7120160", [{ type: "scaleStat", target: "opponent", polarity: "debuff", factor: 2 }], "落井下毒：敌方属性减益层数翻倍");

// 灰色肖像（特性）：攻击使敌方已有减益层数 +3。
{
  const name = "灰色肖像";
  const sprites = byName.get(name);
  const ph = sprites && mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) {
    Object.assign(ph, { trigger: "afterDamage", when: [SELF(name), { path: "target.active.debuffs.*", op: "gt", value: 0 }], effects: [{ type: "scaleStat", target: "opponent", polarity: "debuff", delta: 3 }], note: `特性「${name}」：攻击使敌方已有减益层数 +3` });
    patched++;
  } else console.log("  ! 未找到特性:", name);
}

console.log(`patch ${patched} 条，新增 ${added} 条`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
