// 第四期迅捷族特性：快锤 / 暴食 / 翼轴 / 相争（+ 清理已实装的萌化状态占位）。
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

const traits = [
  { name: "快锤", effects: [{ type: "setRuleModifier", target: "self", key: "quick.costBelow", value: 3 }], note: "携带的能耗小于 3 的技能获得迅捷" },
  { name: "暴食", effects: [{ type: "setRuleModifier", target: "self", key: "quick.element.Dragon", value: true }], note: "携带的龙系技能获得迅捷" },
  { name: "翼轴", effects: [
    { type: "setRuleModifier", target: "self", key: "quick.slot1", value: true },
    { type: "unsupported", effectType: "shift1", reason: "1 号位传动 1 待实现【待校准】" },
  ], note: "1 号位技能获得迅捷（传动 1 待实现）" },
  { name: "相争", effects: [
    { type: "setRuleModifier", target: "self", key: "quick.priorityBonus", value: 1 },
    { type: "unsupported", effectType: "firstQuick", reason: "本场首次使用技能获得迅捷 待实现【待校准】" },
  ], note: "拥有迅捷效果的技能先手 +1（首次技能迅捷待实现）" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;

// 清理：萌化已由引擎实装，删除多余的 unsupported 状态占位。
let removed = 0;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (mechs[i].id === "status:moe") { mechs.splice(i, 1); removed++; }
}

let patched = 0, added = 0;
for (const { name, effects, note } of traits) {
  const ids = byName.get(name);
  if (!ids?.length) { console.log("  ! 未找到特性:", name); continue; }
  const full = {
    ownerType: "trait",
    ownerId: ids[0],
    trigger: "passive",
    when: [{ path: "self.active.spriteId", op: "in", value: ids }],
    effects,
    note: `特性「${name}」：${note}`,
  };
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; continue; }
  let id = `trait:${ids[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${ids[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
}
console.log(`remove ${removed}，patch ${patched}，add ${added}`);
if (!removed && !patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
