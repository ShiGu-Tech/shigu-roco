import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
// 特性名 → 携带该特性的精灵 id 列表（机制按此条件匹配）。
const byName = new Map();
for (const sp of catalog.sprites) {
  const name = sp.trait?.name;
  if (!name) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(sp.id);
}

const SELF = (name) => ({ path: `self.active.spriteId`, op: "in", value: byName.get(name) ?? [] });
const ELEM = (e) => ({ path: "event.element", op: "eq", value: e });

// 清晰可直出的特性（trigger + 条件 + 效果）。
const traits = [
  // 入场 / 换人
  { name: "超级电池", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("超级电池") ?? [] }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 40 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 40 }] },
  { name: "蓄电池", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("蓄电池") ?? [] }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 30 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 30 }] },
  { name: "专注力", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("专注力") ?? [] }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 100 }], note: "仅首回合（衰减待校准）" },
  { name: "全神贯注", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("全神贯注") ?? [] }], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 100 }], note: "每次行动 −20% 待校准" },
  { name: "大捞一笔", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("大捞一笔") ?? [] }], effects: [{ type: "modifyEnergy", target: "opponent", delta: -3 }] },
  { name: "小偷小摸", trigger: "onEntry", when: [{ path: "event.enteredSpriteId", op: "in", value: byName.get("小偷小摸") ?? [] }], effects: [{ type: "modifyEnergy", target: "opponent", delta: -2 }] },
  { name: "茶多酚", trigger: "afterSwitch", when: [SELF("茶多酚")], effects: [{ type: "heal", target: "self", amount: 0.2, basis: "maxHp" }] },
  { name: "美拉德反应", trigger: "afterSwitch", when: [SELF("美拉德反应")], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 20 }] },
  { name: "吉利丁片", trigger: "afterSwitch", when: [SELF("吉利丁片")], effects: [{ type: "modifyStat", target: "self", stat: "defense", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spdef", mode: "percent", value: 20 }] },
  // 回合末
  { name: "生长", trigger: "turnEnd", when: [SELF("生长")], effects: [{ type: "heal", target: "self", amount: 0.12, basis: "maxHp" }] },
  { name: "养分内循环", trigger: "turnEnd", when: [SELF("养分内循环")], effects: [{ type: "modifyEnergy", target: "self", delta: 6 }] },
  { name: "养分重吸收", trigger: "turnEnd", when: [SELF("养分重吸收")], effects: [{ type: "modifyEnergy", target: "self", delta: 3 }] },
  { name: "毒蘑菇", trigger: "turnEnd", when: [SELF("毒蘑菇")], effects: [{ type: "modifyEnergy", target: "opponent", delta: -1 }] },
  { name: "吸积盘", trigger: "turnEnd", when: [SELF("吸积盘")], effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 2 }] },
  // 使用某系技能后
  { name: "助燃", trigger: "skillUsed", when: [SELF("助燃"), ELEM("Fire")], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 20 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 20 }] },
  { name: "爆燃", trigger: "skillUsed", when: [SELF("爆燃"), ELEM("Fire")], effects: [{ type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 30 }, { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 30 }] },
  { name: "浸润", trigger: "skillUsed", when: [SELF("浸润"), ELEM("Water")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -1, mode: "add", duration: "turns", turns: 1 }] },
  { name: "浪潮", trigger: "skillUsed", when: [SELF("浪潮"), ELEM("Water")], effects: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -2, mode: "add", duration: "turns", turns: 1 }] },
  { name: "乘风连击", trigger: "skillUsed", when: [SELF("乘风连击"), ELEM("Wing")], effects: [{ type: "addCounter", target: "self", key: "combo-add", delta: 1 }] },
  { name: "生物碱", trigger: "skillUsed", when: [SELF("生物碱"), ELEM("Grass")], effects: [{ type: "applyStatus", target: "opponent", statusId: "poison", layers: 2, immuneElements: ["Grass"] }] },
  { name: "高浓生物碱", trigger: "skillUsed", when: [SELF("高浓生物碱"), ELEM("Grass")], effects: [{ type: "applyStatus", target: "opponent", statusId: "poison", layers: 3, immuneElements: ["Grass"] }] },
  { name: "氧循环", trigger: "skillUsed", when: [SELF("氧循环"), ELEM("Grass")], effects: [{ type: "heal", target: "self", amount: 0.1, basis: "maxHp" }] },
  { name: "深层氧循环", trigger: "skillUsed", when: [SELF("深层氧循环"), ELEM("Grass")], effects: [{ type: "heal", target: "self", amount: 0.15, basis: "maxHp" }] },
  { name: "碰瓷", trigger: "skillUsed", when: [SELF("碰瓷"), ELEM("Dark")], effects: [{ type: "modifyEnergy", target: "opponent", delta: -2 }] },
  // 先手 / 元素威力
  { name: "顺风", trigger: "beforeDamage", when: [SELF("顺风"), { path: "event.wentFirst", op: "eq", value: true }], effects: [{ type: "modifyDamage", mode: "multiply", value: 1.5, scope: "outgoing" }] },
  { name: "破空", trigger: "beforeDamage", when: [SELF("破空"), { path: "event.wentFirst", op: "eq", value: true }], effects: [{ type: "modifyDamage", mode: "multiply", value: 1.75, scope: "outgoing" }] },
  { name: "目空", trigger: "beforeDamage", when: [SELF("目空"), { path: "event.element", op: "neq", value: "Light" }], effects: [{ type: "modifyDamage", mode: "multiply", value: 1.25, scope: "outgoing" }] },
  // 受击 / 受攻击（持有者为受击方 → 用 target）
  { name: "乌龟塔理论", trigger: "afterDamage", when: [{ path: "target.active.spriteId", op: "in", value: byName.get("乌龟塔理论") ?? [] }], effects: [{ type: "applyMark", target: "self", markId: "starfall-mark", layers: 3 }], note: "持有者受击 → 攻击方获得层数（target 侧）" },
  { name: "扎手", trigger: "afterDamage", when: [{ path: "target.active.spriteId", op: "in", value: byName.get("扎手") ?? [] }], effects: [{ type: "applyMark", target: "self", markId: "thorn-mark", layers: 1 }] },
  { name: "诅咒", trigger: "afterDamage", when: [{ path: "target.active.spriteId", op: "in", value: byName.get("诅咒") ?? [] }], effects: [{ type: "applyMark", target: "self", markId: "undertow-mark", layers: 1 }] },
  // 在场（每回合续期）
  { name: "冰封", trigger: "beforeAction", when: [SELF("冰封")], effects: [{ type: "modifySkillCost", target: "opponent", scope: "all", delta: 1, mode: "add", duration: "turns", turns: 1 }] },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const t of traits) {
  const sprites = byName.get(t.name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", t.name); continue; }
  generated.push({
    id: `trait:${sprites[0]}`,
    ownerType: "trait",
    ownerId: sprites[0],
    trigger: t.trigger,
    when: t.when,
    effects: t.effects,
    note: `特性「${t.name}」${t.note ? "：" + t.note : ""}`,
  });
}

// 不同特性可能共用同一精灵（ownerId 冲突）→ 用 trait 名做后缀消歧。
const seen = new Map();
for (const m of generated) {
  if (existing.has(m.id) || seen.has(m.id)) {
    const base = m.id;
    let i = 2;
    while (existing.has(`${base}#${i}`) || seen.has(`${base}#${i}`)) i++;
    m.id = `${base}#${i}`;
  }
  seen.set(m.id, true);
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
