// 第四期 · 免蓄力 / 蓄力任选 / 打断 / 元素链：龙血 / 龙守望 / 嫉妒 / 游弋 / 威慑 / 大雪球 / 大火球。
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

const upsertTrait = (name, trigger, effects, note, extraWhen = []) => {
  const ids = byName.get(name);
  if (!ids?.length) { console.log("  ! 未找到特性:", name); return; }
  const full = { ownerType: "trait", ownerId: ids[0], trigger, when: [{ path: "self.active.spriteId", op: "in", value: ids }, ...extraWhen], effects, note: `特性「${name}」：${note}` };
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `trait:${ids[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${ids[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

// 龙血：应对攻击成功 → 下次技能无需蓄力。
const dragonBlood = mechs.find((m) => m.id === "skill:sk-7100250:declare");
if (dragonBlood) {
  dragonBlood.effects = [
    { type: "forceFirst", target: "self" },
    { type: "applyStatus", target: "self", statusId: "def-7100250", layers: 1 },
    { type: "addCounter", target: "self", key: "noCharge", delta: 1 },
  ];
  dragonBlood.note = "龙血：应对攻击成功 → 必定先手 + 本回合承伤 −70%；下次技能无需蓄力";
  patched++;
}

// 龙守望：使用后下一次技能无需蓄力。
{
  const id = "skill:sk-7100300";
  const full = { ownerType: "skill", ownerId: "sk-7100300", trigger: "actionResolved", when: [{ path: "event.action.skillId", op: "eq", value: "sk-7100300" }], effects: [{ type: "addCounter", target: "self", key: "noCharge", delta: 1 }], note: "龙守望：下一次技能无需蓄力" };
  const ph = mechs.find((m) => m.id === id);
  if (ph) { Object.assign(ph, full); patched++; } else { mechs.push({ id, ...full }); added++; }
  const charge = mechs.find((m) => m.id === "skill:sk-7100300:charge");
  if (charge) { charge.effects = [{ type: "unsupported", effectType: "chargeWhileCast", reason: "蓄力状态下使用本技能 待实现【待校准】" }]; charge.note = "龙守望：蓄力中可释放待实现"; patched++; }
}

// 嫉妒 / 游弋：蓄力状态下可使用任一携带技能。
upsertTrait("嫉妒", "passive", [{ type: "setRuleModifier", target: "self", key: "charge.any", value: true }], "蓄力状态下可使用任一携带技能");
upsertTrait("游弋", "passive", [
  { type: "setRuleModifier", target: "self", key: "charge.any", value: true },
  { type: "unsupported", effectType: "chargeBuff", reason: "蓄力时双防 +100% 待实现【待校准】" },
], "蓄力状态下可使用任一携带技能（蓄力双防 +100% 待实现）");

// 威慑：打断敌方时，双攻 +30%，被打断技能冷却 +2。
upsertTrait("威慑", "interrupt", [
  { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 30 },
  { type: "modifyStat", target: "self", stat: "spatk", mode: "percent", value: 30 },
  { type: "modifyCooldown", target: "opponent", skillIdFrom: "event.skillId", delta: 2 },
], "打断敌方时双攻 +30%，被打断技能冷却 +2");

// 大雪球 / 大火球：使用 2 次不同的冰 / 火系技能后触发。
upsertTrait("大雪球", "skillUsed", [
  { type: "applyStatus", target: "opponent", statusId: "freeze", layers: 4, immuneElements: ["Ice"] },
  { type: "clearCounter", target: "self", key: "elChainIce" },
  { type: "clearCounter", target: "self", key: "lastElIdxIce" },
], "使用 2 次不同的冰系技能 → 敌方 4 层冻结，随后重置", [{ path: "self.active.counters.elChainIce", op: "gte", value: 2 }]);

upsertTrait("大火球", "skillUsed", [
  { type: "addCounter", target: "self", key: "noCharge", delta: 1 },
  { type: "clearCounter", target: "self", key: "elChainFire" },
  { type: "clearCounter", target: "self", key: "lastElIdxFire" },
], "使用 2 次不同的火系技能 → 下次技能无需蓄力，随后重置", [{ path: "self.active.counters.elChainFire", op: "gte", value: 2 }]);

console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
