// 第四期 · 迅捷剩余：起飞加速 / 飓风（+ 相争首次技能迅捷补全）。
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

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;

const upsert = (name, trigger, effects, note) => {
  const ids = byName.get(name);
  if (!ids?.length) { console.log("  ! 未找到特性:", name); return; }
  const full = { ownerType: "trait", ownerId: ids[0], trigger, when: [{ path: "self.active.spriteId", op: "in", value: ids }], effects, note: `特性「${name}」：${note}` };
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `trait:${ids[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${ids[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

// 起飞加速：本场首次使用的技能永久迅捷。
upsert("起飞加速", "passive", [{ type: "setRuleModifier", target: "self", key: "quick.first", value: true }], "本场战斗首次使用的技能获得迅捷");

// 飓风：其他翼系精灵携带相同技能 → 迅捷；被击败额外损失 1 魔力。
upsert("飓风", "passive", [{ type: "setRuleModifier", target: "self", key: "quick.sharedWing", value: true }], "其他翼系精灵携带相同技能 → 迅捷");
const wind = byName.get("飓风");
if (wind?.length) {
  const id = `trait:${wind[0]}#death`;
  const full = { ownerType: "trait", ownerId: wind[0], trigger: "afterDeath", when: [{ path: "self.active.spriteId", op: "in", value: wind }], effects: [{ type: "modifyMagic", target: "self", delta: -1 }], note: "特性「飓风」：被击败时额外损失 1 点魔力" };
  const ph = mechs.find((m) => m.id === id);
  if (ph) { Object.assign(ph, full); patched++; } else { mechs.push({ id, ...full }); added++; }
}

// 相争：补「首次技能迅捷」。
const contention = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith("特性「相争」"));
if (contention) {
  if (!contention.effects.some((e) => e.type === "setRuleModifier" && e.key === "quick.first")) {
    contention.effects.push({ type: "setRuleModifier", target: "self", key: "quick.first", value: true });
    patched++;
  }
  contention.effects = contention.effects.filter((e) => e.type !== "unsupported");
  contention.note = "特性「相争」：本场首次使用的技能获得迅捷；拥有迅捷效果的技能先手 +1";
}

console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
