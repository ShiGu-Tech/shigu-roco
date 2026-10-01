#!/usr/bin/env node

/** 技能效果转写器（保守 / 幂等 / 只追加）。
 *
 *  1) 星陨全套：手工登记的印记叠加与条件触发（应对状态 / 应对防御 / 应对攻击、无印记叠层、连击随层数）。
 *  2) 无条件从句：`<自己|敌方>获得 N 层<印记名|状态名>`（整句无「应对 / 若 / 选择 / 驱散 / 翻倍」等条件词）。
 *
 * 规则：只新增 id 不存在的条目；攻击技若已有作者登记的 dealDamage 则不再补基础伤害。
 * 用法：`node scripts/derive-effects.mjs`（dry-run 报告）/ `node scripts/derive-effects.mjs --write`。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const registryRoot = path.join(ROOT, "data", "registry", "catalogs");
const index = JSON.parse(readFileSync(path.join(registryRoot, "index.json"), "utf8"));
const catalog = JSON.parse(readFileSync(path.join(registryRoot, index.activeRegistrationId, "catalog.json"), "utf8"));
const mechanismsFile = path.join(ROOT, "data", "mechanisms.json");
const doc = JSON.parse(readFileSync(mechanismsFile, "utf8"));

const skillById = Object.fromEntries(catalog.skills.map((s) => [s.id, s]));
const norm = (name) => String(name || "").replace(/印记$|状态$/, "");
const markByName = Object.fromEntries((catalog.marks || []).map((m) => [norm(m.name), m.id]));
const statusByName = Object.fromEntries((catalog.statuses || []).map((s) => [norm(s.name), s.id]));
const existingIds = new Set(doc.mechanisms.map((e) => e.id));
const damageOwners = new Set(
  doc.mechanisms.filter((e) => e.ownerType === "skill" && e.effects.some((f) => f.type === "dealDamage")).map((e) => e.ownerId),
);
const appliedOwners = new Set(
  doc.mechanisms.filter((e) => e.ownerType === "skill" && e.effects.some((f) => f.type === "applyMark" || f.type === "applyStatus")).map((e) => e.ownerId),
);

const when = (skillId) => [{ path: "event.action.skillId", op: "eq", value: skillId }];

function baseDamage(skillId) {
  const skill = skillById[skillId];
  if (!skill || (skill.category !== "Physical" && skill.category !== "Magic") || !(Number(skill.power) > 0)) return [];
  const category = skill.category;
  return [{ type: "dealDamage", target: "target", category, power: Number(skill.power), skillId }];
}

/** 星陨系：手工登记（含条件）。 */
const STARFALL = [
  { id: "starfall:sk-7190220", ownerId: "sk-7190220", effects: [...baseDamage("sk-7190220"), { type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 1 }] },
  { id: "starfall:sk-7190280", ownerId: "sk-7190280", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 4 }] },
  { id: "starfall:sk-7190290", ownerId: "sk-7190290", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 2 }] },
  { id: "starfall:sk-7190300", ownerId: "sk-7190300", note: "星链：2 连击，每次 +1 层 → 合计 +2（连击按层处理）", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 2 }] },
  { id: "starfall:sk-7190310", ownerId: "sk-7190310", note: "超新星馈赠：基础 +2 层；「每使用 1 次永久 +1」待校准", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 2 }] },
  { id: "starfall:sk-7190270", ownerId: "sk-7190270", effects: baseDamage("sk-7190270") },
  { id: "starfall:sk-7190270:counter", ownerId: "sk-7190270", trigger: "actionDeclared", when: [{ allOf: [when("sk-7190270")[0], { path: "event.opponentAction.actionType", op: "eq", value: "Status" }] }], note: "错乱：应对状态 → 敌方 +3 层星陨印记", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 3 }] },
  { id: "starfall:sk-7190330", ownerId: "sk-7190330", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 3 }] },
  { id: "starfall:sk-7190330:counter", ownerId: "sk-7190330", trigger: "actionDeclared", when: [{ allOf: [when("sk-7190330")[0], { path: "event.opponentAction.actionType", op: "eq", value: "Defense" }] }], note: "二律背反：应对防御 → 敌方星陨印记翻倍（≈再 +3）", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 3 }] },
  { id: "starfall:sk-7190400", ownerId: "sk-7190400", effects: [{ type: "applyStatus", target: "self", statusId: "meditative-shield", layers: 1 }] },
  { id: "starfall:sk-7190400:counter", ownerId: "sk-7190400", trigger: "actionDeclared", when: [{ allOf: [when("sk-7190400")[0], { path: "event.opponentAction.actionType", op: "eq", value: "Attack" }] }], note: "冥想：应对攻击 → 敌方 +2 层星陨印记", effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 2 }] },
  { id: "starfall:sk-7190400:reduce", ownerId: "sk-7190400", trigger: "beforeDamage", when: [{ path: "target.active.statuses.meditative-shield", op: "gte", value: 1 }], note: "冥想：本回合承伤 -80%", effects: [{ type: "setDamageReduction", target: "target", percent: 80 }] },
  { id: "starfall:sk-7190520", ownerId: "sk-7190520", effects: [{ type: "applyStatus", target: "self", statusId: "gravity-shield", layers: 1 }] },
  { id: "starfall:sk-7190520:reduce", ownerId: "sk-7190520", trigger: "beforeDamage", when: [{ path: "target.active.statuses.gravity-shield", op: "gte", value: 1 }], note: "引力偏转：本回合承伤 -80%", effects: [{ type: "setDamageReduction", target: "target", percent: 80 }] },
  { id: "starfall:sk-7190520:counter", ownerId: "sk-7190520", trigger: "actionDeclared", when: [{ allOf: [when("sk-7190520")[0], { path: "event.opponentAction.actionType", op: "eq", value: "Attack" }] }], effects: [{ type: "unsupported", effectType: "conditional", reason: "引力偏转：应对攻击时以魔法伤害触发星陨（待接入）" }] },
  { id: "starfall:sk-7190500", ownerId: "sk-7190500", effects: baseDamage("sk-7190500") },
  { id: "starfall:sk-7190500:noMark", ownerId: "sk-7190500", note: "量子涨落：无星陨印记时 → 敌方 +3 层", when: [{ allOf: [when("sk-7190500")[0], { not: { path: "target.active.marks.starfall-mark", op: "gte", value: 1 } }] }], effects: [{ type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 3 }] },
  { id: "starfall:sk-7190260", ownerId: "sk-7190260", effects: baseDamage("sk-7190260") },
  { id: "starfall:sk-7190260:hits", ownerId: "sk-7190260", trigger: "beforeDamage", when: [{ path: "event.skillId", op: "eq", value: "sk-7190260" }], note: "多维击打：连击数 = 1 + 敌方星陨印记层数", effects: [{ type: "setHits", target: "target", markId: "starfall-mark", base: 1, perStack: 1 }] },
  { id: "starfall:sk-7190320", ownerId: "sk-7190320", effects: [{ type: "unsupported", effectType: "conditional", reason: "心灵洞悉：获得层数 = 敌方当前印记层数（动态层数待接入）" }] },
  { id: "starfall:sk-7190510", ownerId: "sk-7190510", effects: [...baseDamage("sk-7190510"), { type: "unsupported", effectType: "conditional", reason: "奇点：上回合双方有精灵使用水系技能则 +4 层（需记录上回合技能系别）" }] },
  { id: "starfall:sk-7190490", ownerId: "sk-7190490", effects: [{ type: "unsupported", effectType: "conditional", reason: "观测者效应：换上精灵以月陨星状态登场（待接入）" }] },
].map((e) => ({ trigger: "beforeAction", ...e }));

/** 无条件从句：`<自己|敌方>获得 N 层<印记|状态>`。 */
const clauseRe = /^(敌方|敌人|对手|自己)获得(\d+)层?(.+?)$/;
function deriveClause(skillId) {
  if (appliedOwners.has(skillId)) return null;
  if (STARFALL.some((e) => e.ownerId === skillId)) return null;
  const effects = [];
  for (const clause of String(skillById[skillId]?.description ?? "").split(/[，。]/)) {
    const m = clause.match(clauseRe);
    if (!m) continue;
    const target = m[1] === "自己" ? "self" : "opponent";
    const layers = Number(m[2]);
    const name = m[3].trim();
    const markId = markByName[name];
    const statusId = statusByName[name];
    if (markId) effects.push({ type: "applyMark", target, markId, layers });
    else if (statusId) effects.push({ type: "applyStatus", target, statusId, layers });
  }
  if (!effects.length) return null;
  const damage = damageOwners.has(skillId) ? [] : baseDamage(skillId);
  return { id: `derived:skill:${skillId}`, ownerType: "skill", ownerId: skillId, trigger: "beforeAction", when: when(skillId), effects: [...damage, ...effects] };
}

const derived = catalog.skills.map((s) => deriveClause(s.id)).filter(Boolean);
const starfall = STARFALL.filter((e) => !existingIds.has(e.id)).map((e) => ({ ownerType: "skill", ...e }));

const additions = [...starfall, ...derived.filter((e) => !existingIds.has(e.id))];
console.log(`星陨新增 ${starfall.length} 条；无条件从句新增 ${additions.length - starfall.length} 条；共 ${additions.length} 条。`);
console.log("无条件从句样例：");
for (const e of derived.slice(0, 12)) console.log("  ", skillById[e.ownerId].skillName, "::", e.effects.filter((f) => f.type !== "dealDamage").map((f) => `${f.target}:${f.markId ?? f.statusId}×${f.layers}`).join(" "));

if (!process.argv.includes("--write")) {
  console.log("\n(dry-run) 加 --write 写入。");
} else {
  const version = doc.version.split(".").map(Number);
  version[1] += 1;
  version[2] = 0;
  const next = {
    ...doc,
    version: version.join("."),
    updatedAt: "2026-10-01",
    mechanisms: [...doc.mechanisms, ...additions],
  };
  writeFileSync(mechanismsFile, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(`\n已写入：${additions.length} 条，version ${doc.version} → ${next.version}，总计 ${next.mechanisms.length} 条。`);
}
