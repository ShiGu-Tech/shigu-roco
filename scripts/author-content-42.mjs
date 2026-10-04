// 第四期 · 萌化/变身族：自由飘 / 腾挪 / 保卫 / 好象坏象 / 无忧无虑。
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

const QIQI = "sp-192-1"; // 棋绮后

const traits = [
  {
    name: "自由飘",
    def: {
      trigger: "beforeDamage",
      effects: [{ type: "setHits", target: "self", hitsFrom: { path: "self.active.statuses.moe", scale: 3, offset: 1 } }],
      extraWhen: [{ path: "self.active.statuses.moe", op: "gte", value: 1 }],
    },
    note: "每有 1 层萌化，连击数 +3（近似为总段数 3×层+1）",
  },
  {
    name: "腾挪",
    def: {
      trigger: "skillUsed",
      effects: [
        { type: "heal", target: "self", amount: 1, basis: "maxHp" },
        { type: "modifyEnergy", target: "self", delta: 0, toMax: true },
        { type: "transform", target: "self", spriteId: QIQI },
      ],
      extraWhen: [{ path: "event.reacted", op: "eq", value: true }, { path: "event.actionType", op: "eq", value: "Attack" }],
    },
    note: "攻击技能应对成功后 → 回满生命 / 能量并变为棋绮后",
  },
  {
    name: "好象坏象",
    def: {
      trigger: "skillUsed",
      effects: [
        { type: "heal", target: "self", amount: 1, basis: "maxHp" },
        { type: "modifyEnergy", target: "self", delta: 0, toMax: true },
        { type: "transform", target: "self", spriteId: QIQI },
      ],
      extraWhen: [{ path: "event.reacted", op: "eq", value: true }, { path: "event.actionType", op: "eq", value: "Status" }],
    },
    note: "状态技能应对成功后 → 回满生命 / 能量并变为棋绮后",
  },
];

const FILE2 = FILE;
const file = JSON.parse(fs.readFileSync(FILE2, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;

const upsert = (name, ids, trigger, effects, when, note) => {
  const full = { ownerType: "trait", ownerId: ids[0], trigger, when, effects, note: `特性「${name}」：${note}` };
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `trait:${ids[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${ids[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

for (const { name, def, note } of traits) {
  const ids = byName.get(name);
  if (!ids?.length) { console.log("  ! 未找到特性:", name); continue; }
  upsert(name, ids, def.trigger, def.effects, [{ path: "self.active.spriteId", op: "in", value: ids }, ...(def.extraWhen ?? [])], note);
}

// 保卫：防御技能应对成功累计 2 次 → 回满 + 变为棋绮后。
const guardIds = byName.get("保卫");
if (guardIds?.length) {
  upsert("保卫", guardIds, "skillUsed", [{ type: "addCounter", target: "self", key: "guardReact", delta: 1 }], [
    { path: "self.active.spriteId", op: "in", value: guardIds },
    { path: "event.reacted", op: "eq", value: true },
    { path: "event.actionType", op: "eq", value: "Defense" },
  ], "防御技能应对成功累计 2 次后 → 回满生命 / 能量并变为棋绮后（计数）");
  // 达成判定放在 actionResolved（skillUsed 已先自增）。
  const full = {
    ownerType: "trait",
    ownerId: guardIds[0],
    trigger: "actionResolved",
    when: [{ path: "self.active.spriteId", op: "in", value: guardIds }, { path: "self.active.counters.guardReact", op: "gte", value: 2 }],
    effects: [
      { type: "heal", target: "self", amount: 1, basis: "maxHp" },
      { type: "modifyEnergy", target: "self", delta: 0, toMax: true },
      { type: "transform", target: "self", spriteId: QIQI },
      { type: "clearCounter", target: "self", key: "guardReact" },
    ],
    note: "特性「保卫」：防御技能应对成功 2 次 → 回满并变为棋绮后（达成）",
  };
  const key = `trait:${guardIds[0]}#guard`;
  const ph = mechs.find((m) => m.id === key);
  if (ph) { Object.assign(ph, full); patched++; } else { mechs.push({ id: key, ...full }); added++; }
}

// 无忧无虑：萌化层数无上限（引擎当前本就无上限，记为规则标记）。
const carefree = byName.get("无忧无虑");
if (carefree?.length) {
  upsert("无忧无虑", carefree, "passive", [{ type: "setRuleModifier", target: "self", key: "status.moe.noCap", value: true }], [{ path: "self.active.spriteId", op: "in", value: carefree }], "萌化层数不受限制（引擎当前无上限，视为已满足）");
}

console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
