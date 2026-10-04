// 第四期 · 长尾收官：全队被动 / 特性继承 / 选择分支改写 / 巧变 / 球半效果 / 迸发延长 / 技能内嵌。
// 覆盖特性：连续负荷 / 狂欢开始 / 换碟 / 魔术帽 / 光度换算 / 长久保存制法 / 博物 / 正模标本 / 秋收 / 铭记于月亮
// 覆盖技能：无畏之心 / 疾风连袭 / 踏雷；并给契约的形状的球效果补「棱镜球半量」分支。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const sprites = catalog.sprites;
const skills = catalog.allSkills;
const traitIds = (name) => sprites.filter((s) => s.trait?.name === name).map((s) => s.id);
const skillByName = (name) => {
  const hit = skills.find((s) => s.name === name || s.nameZh === name);
  if (!hit) throw new Error(`未找到技能：${name}`);
  return hit.id;
};
const skillIdsByElement = (element) => skills.filter((s) => s.element === element).map((s) => s.id);

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;

const TRAITS = ["连续负荷", "狂欢开始", "换碟", "魔术帽", "光度换算", "长久保存制法", "博物", "正模标本", "秋收", "铭记于月亮"];
const IN_TRAITS = (note) => TRAITS.some((n) => String(note ?? "").startsWith(`特性「${n}」`));

// 清理旧占位（待实现）与本脚本可能残留的条目。
for (let i = mechs.length - 1; i >= 0; i--) {
  const m = mechs[i];
  const note = String(m.note ?? "");
  if (IN_TRAITS(note) && note.includes("待实现")) mechs.splice(i, 1);
  if (m.id?.endsWith("#c55")) mechs.splice(i, 1);
}

const added = [];
const push = (def) => added.push(def);
const inList = (ids) => ({ path: "self.active.spriteId", op: "in", value: ids });

// ---------------------------------------------------------------- 连续负荷
{
  const s = traitIds("连续负荷");
  if (s.length) push({ id: "trait:sp-272-1#c55", ownerType: "trait", ownerId: s[0], trigger: "passive", when: [inList(s)], effects: [{ type: "setRuleModifier", target: "self", key: "burst.extend", value: 1 }], note: "特性「连续负荷」：自己技能的迸发窗口延长 1 次行动" });
}

// ---------------------------------------------------------------- 狂欢开始（伤害部分）
{
  const s = traitIds("狂欢开始");
  if (s.length) push({ id: `trait:${s[0]}#c55`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [inList(s)], effects: [{ type: "setRuleModifier", target: "self", key: "damage.superEffectiveTaken", value: 0.25 }], note: "特性「狂欢开始」：受到的克制伤害 +25%（近似：背包随机精灵 / 限换未落地，需队伍动态域）" });
}

// ---------------------------------------------------------------- 换碟
{
  const s = traitIds("换碟");
  const ids = ["音波弹", "音爆", "金属噪音", "午夜噪音"].map(skillByName);
  if (s.length) {
    push({ id: `trait:${s[0]}#c55-power`, ownerType: "trait", ownerId: s[0], trigger: "beforeDamage", when: [{ path: "event.skillId", op: "in", value: ids }], effects: [{ type: "addPower", target: "self", value: 30 }], note: "特性「换碟」：携带的音波弹/音爆/金属噪音/午夜噪音威力 +30（【待校准】量级）" });
    push({ id: `trait:${s[0]}#c55-improv`, ownerType: "trait", ownerId: s[0], trigger: "skillUsed", when: [{ path: "event.skillId", op: "in", value: ids }], effects: [{ type: "randomizeSkill", target: "self", skillIdFrom: "event.skillId", sourceFrom: "sameElement", costDelta: -1 }], note: "特性「换碟」：上述技能获得巧变：同系别技能（用后变为同系随机技能且能耗 −1）" });
  }
}

// ---------------------------------------------------------------- 魔术帽
{
  const s = traitIds("魔术帽");
  if (s.length) {
    const onField = { anyOf: [{ path: "selfTeam", op: "contains", value: s[0] }, { path: "targetTeam", op: "contains", value: s[0] }] };
    push({ id: `trait:${s[0]}#c55`, ownerType: "trait", ownerId: s[0], trigger: "skillUsed", when: [onField], effects: [{ type: "randomizeSkill", target: "self", skillIdFrom: "event.skillId", sourceFrom: "sameElement", costDelta: -1 }], note: "特性「魔术帽」：场上双方携带的技能获得巧变：同系别技能" });
  }
}

// ---------------------------------------------------------------- 光度换算
{
  const s = traitIds("光度换算");
  if (s.length) {
    push({ id: `trait:${s[0]}#c55-choice`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [inList(s)], effects: [{ type: "setRuleModifier", target: "self", key: "choice.element.Fire", value: true }], note: "特性「光度换算」：携带的火系技能获得选择" });
    push({ id: `trait:${s[0]}#c55-convert`, ownerType: "trait", ownerId: s[0], trigger: "actionResolved", when: [inList(s), { path: "event.action.element", op: "eq", value: "Fire" }, { path: "event.action.choice", op: "eq", value: 1 }], effects: [{ type: "heal", target: "self", amount: -0.15, basis: "maxHp" }, { type: "addCounter", target: "self", key: "power-add:Light", delta: 30 }], note: "特性「光度换算」：火系技能选择·暗 → 失去 15% 生命，光系技能威力永久 +30" });
  }
}

// ---------------------------------------------------------------- 长久保存制法
{
  const s = traitIds("长久保存制法");
  if (s.length) {
    push({ id: `trait:${s[0]}#c55-choice`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [inList(s)], effects: [{ type: "setRuleModifier", target: "self", key: "choice.energy", value: true }], note: "特性「长久保存制法」：自己的聚能获得选择" });
    push({ id: `trait:${s[0]}#c55-steal`, ownerType: "trait", ownerId: s[0], trigger: "energyGained", when: [inList(s), { path: "event.choice", op: "eq", value: 1 }], effects: [{ type: "modifyEnergy", target: "opponent", delta: -3 }, { type: "modifyEnergy", target: "self", delta: 3 }], note: "特性「长久保存制法」：聚能选择·暗 → 偷取敌方 3 能量" });
  }
}

// ---------------------------------------------------------------- 博物（识破伪装）
{
  const s = traitIds("博物");
  if (s.length) push({ id: `trait:${s[0]}#c55`, ownerType: "trait", ownerId: s[0], trigger: "turnStart", when: [inList(s)], effects: [{ type: "revealDisguise", target: "opponent" }], note: "特性「博物」：在场时识破敌方伪装（【待校准】图鉴暂无伪装数据，能力已就绪）" });
}

// ---------------------------------------------------------------- 正模标本
{
  const s = traitIds("正模标本");
  if (s.length) push({ id: `trait:${s[0]}#c55`, ownerType: "trait", ownerId: s[0], trigger: "afterDeath", when: [{ path: "selfTeam", op: "contains", value: s[0] }, { path: "event.spriteId", op: "neq", value: s[0] }], effects: [{ type: "scheduleRevive", target: "self", afterTurns: 1, spriteId: s[0] }], note: "特性「正模标本」：队内其他精灵力竭 1 回合后变为未完虫" });
}

// ---------------------------------------------------------------- 秋收
{
  const s = traitIds("秋收");
  if (s.length) push({ id: `trait:${s[0]}#c55`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ anyOf: [{ path: "self.active.element", op: "contains", value: "Grass" }, { path: "target.active.element", op: "contains", value: "Grass" }] }], effects: [{ type: "setRuleModifier", target: "self", key: "power.element.Mechanic", value: 0.5 }], note: "特性「秋收」：处于草系环境时机械系技能威力 +50%（近似：以任一在场含草系为草系环境）" });
}

// ---------------------------------------------------------------- 铭记于月亮（特性继承）
{
  const s = traitIds("铭记于月亮");
  if (s.length) push({ id: `trait:${s[0]}#c55-inherit`, ownerType: "trait", ownerId: s[0], trigger: "afterDeath", when: [{ path: "target.active.spriteId", op: "in", value: s }, { path: "event.killerSide", op: "eq", valueFrom: "targetSide" }], effects: [{ type: "inheritTrait", target: "target", from: "opponent" }], note: "特性「铭记于月亮」：击败对手后继承其特性的被动规则（近似：仅继承被动规则覆盖）" });
}

// ---------------------------------------------------------------- 无畏之心
{
  const declare = mechs.find((m) => m.id === "skill:sk-7020810:declare");
  if (declare) {
    declare.effects = (declare.effects ?? []).filter((e) => e.type !== "unsupported");
    if (!declare.effects.some((e) => e.type === "modifySkillCost")) {
      declare.effects.push({ type: "modifySkillCost", target: "self", skillId: "sk-7020810", delta: 2, duration: "permanent", key: "fortitude:cost" });
    }
    declare.note = "无畏之心：应对攻击成功 → 必定先手 + 本回合承伤 −100% + 本技能能耗永久 +2";
  }
  push({ id: "skill:sk-7020810#c55-healback", ownerType: "skill", ownerId: "sk-7020810", trigger: "passive", when: [{ path: "self.active.statuses.def-7020810", op: "gte", value: 1 }], effects: [{ type: "setRuleModifier", target: "self", key: "damage.healBack", value: 1 }], note: "无畏之心：减免伤害转为回复自己生命" });
}

// ---------------------------------------------------------------- 疾风连袭
{
  const m = mechs.find((x) => x.id === "skill:sk-7150320");
  if (m) {
    m.effects = (m.effects ?? []).filter((e) => e.type !== "unsupported");
    m.effects.push({ type: "replaySkills", target: "self", sourceFrom: "quickUsed" });
    m.note = "疾风连袭：能耗 = 已用迅捷技能能耗之和的一半 + 使用次数；并重放已用迅捷技能";
  }
}

// ---------------------------------------------------------------- 踏雷
{
  const m = mechs.find((x) => x.id === "skill:sk-7110460");
  if (m) {
    m.effects = (m.effects ?? []).filter((e) => e.type !== "unsupported");
    m.note = "踏雷：回合结束时返场；下回合攻击技能获得已触发过的迸发效果（应对防御：全部）";
  }
  push({ id: "skill:sk-7110460#c55-notreact", ownerType: "skill", ownerId: "sk-7110460", trigger: "actionResolved", when: [{ path: "event.action.skillId", op: "eq", value: "sk-7110460" }, { path: "event.reacted", op: "neq", value: true }], effects: [{ type: "setCounter", target: "self", key: "replayBurst", value: 1 }], note: "踏雷：记录复制 1 个迸发效果" });
  push({ id: "skill:sk-7110460#c55-reacted", ownerType: "skill", ownerId: "sk-7110460", trigger: "actionResolved", when: [{ path: "event.action.skillId", op: "eq", value: "sk-7110460" }, { path: "event.reacted", op: "eq", value: true }], effects: [{ type: "setCounter", target: "self", key: "replayBurst", value: 999 }], note: "踏雷：应对防御 → 记录复制全部迸发效果" });
  push({ id: "skill:sk-7110460#c55-replay", ownerType: "skill", ownerId: "sk-7110460", trigger: "beforeAction", when: [{ path: "self.active.counters.replayBurst", op: "gte", value: 1 }, { path: "event.action.category", op: "in", value: ["Physical", "Magic"] }], effects: [{ type: "replaySkills", target: "self", sourceFrom: "burstTriggered", countFrom: "self.active.counters.replayBurst", asBurst: true }, { type: "clearCounter", target: "self", key: "replayBurst" }], note: "踏雷：攻击技能复制已触发的迸发效果" });
}

// ---------------------------------------------------------------- 契约的形状 · 棱镜球半效果
{
  const half = (v) => (typeof v === "number" ? v / 2 : v);
  const scaleEffect = (effect) => {
    const out = { ...effect };
    for (const key of ["delta", "amount", "layers", "value"]) if (typeof out[key] === "number") out[key] = half(out[key]);
    return out;
  };
  const balls = mechs.filter((m) => String(m.note ?? "").startsWith("特性「契约的形状」：") && String(m.note ?? "").includes("球入场效果"));
  for (const m of balls) {
    // 全量分支排除棱镜半量
    m.when = (m.when ?? []).filter((c) => c.path !== "self.active.counters.prismHalf");
    m.when.push({ path: "self.active.counters.prismHalf", op: "neq", value: 1 });
    const clone = JSON.parse(JSON.stringify(m));
    clone.id = `${m.id}#half`;
    clone.when = (m.when ?? []).map((c) => (c.path === "self.active.counters.prismHalf" ? { path: "self.active.counters.prismHalf", op: "eq", value: 1 } : c));
    clone.effects = (m.effects ?? []).map(scaleEffect);
    clone.note = `${m.note}（棱镜球：半量）`;
    clone.when = clone.when.map((c) => c.path === "self.active.counters.prismHalf" ? { path: "self.active.counters.prismHalf", op: "eq", value: 1 } : c);
    added.push(clone);
  }
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) {
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`);
} else console.log("dry-run");
