/** 一次性复盘：把《视频A-战斗记录》的动作流喂进真实引擎，打印「引擎预测 vs 录屏实测」。
 *
 *  运行：`npx tsx scripts/replay-report.ts`（工作目录须能上溯到 data/rules.json，即仓根）。
 *  说明：敌方资质未知 → 用中性占位（5★·60·天分0）；回合配对为**启发式**（按播报先后 + 时间邻近），
 *        未捕获的一侧补「聚能」。因此这是「近似走一遍」，用于看引擎结算的**数量级/先后/形态**，
 *        不是逐帧复现。
 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import {
  Simulator,
  Rng,
  computeStats,
  inferBuild,
  makeActive,
  makeSide,
  makeState,
} from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, DataBundle, Dict, SideState } from "../apps/web/src/modules/engine";

const bundle: DataBundle = getBundle();

// ---------------------------------------------------------------- 名称解析

const spriteByName = (name: string): string => {
  const hit = Object.values(bundle.sprites).find((s) => s.name === name || s.nameZh === name);
  if (!hit) throw new Error(`图鉴缺少精灵：${name}`);
  return String(hit.id);
};
const skillByName = (name: string): string => {
  const hit = Object.values(bundle.skills).find((s) => s.skillName === name || s.nameZh === name);
  if (!hit) throw new Error(`图鉴缺少技能：${name}`);
  return String(hit.id);
};

// ---------------------------------------------------------------- 阵容定义

interface MemberSpec {
  name: string;
  /** 观测面板（我方已知）。 */
  panel: Record<string, number>;
  skills: string[];
}

const TEAM_A_PLAYER: MemberSpec[] = [
  { name: "水灵", panel: { hp: 501, defense: 163, atk: 117, spdef: 238, spatk: 233, speed: 154 }, skills: ["润泽", "水泡盾", "水炮", "寒风吹"] },
  { name: "彩蝶鲨", panel: { hp: 374, defense: 175, atk: 156, spdef: 175, spatk: 201, speed: 267 }, skills: ["天洪", "贮藏", "回旋风暴", "寒风吹"] },
  { name: "冰钻布鲁斯", panel: { hp: 345, defense: 218, atk: 235, spdef: 157, spatk: 86, speed: 159 }, skills: ["力量增效", "暴风雪", "先发制人", "火焰冲锋"] },
  { name: "古卷执政官", panel: { hp: 472, defense: 181, atk: 187, spdef: 227, spatk: 173, speed: 165 }, skills: ["防反", "先发制人", "斩断", "吞噬"] },
  { name: "火羽", panel: { hp: 354, defense: 127, atk: 124, spdef: 177, spatk: 208, speed: 225 }, skills: ["焚烧烙印", "幽灵爆发", "怒火", "回旋风暴"] },
  { name: "寂灭骨龙", panel: { hp: 425, defense: 207, atk: 283, spdef: 149, spatk: 109, speed: 126 }, skills: ["力量增效", "隼鳞", "先发制人", "报复"] },
];

/** 敌方：只有「出场顺序 + 已见技能」，资质中性。 */
const TEAM_A_ENEMY: { name: string; skills: string[] }[] = [
  { name: "铠甲虫", skills: ["虫群过境", "吓退", "假冒"] },
  { name: "锤头鹳", skills: ["潮涌", "水炮", "晒太阳"] },
  { name: "尖嘴狐仙", skills: ["火焰护盾"] },
  { name: "恶魔红钻", skills: ["力量增效", "下注"] },
  { name: "花衣蝶", skills: ["飞断"] },
];

// ---------------------------------------------------------------- 建状态

/** 由观测面板反解我方养成档案（5★·60·天分≤10·全性格）。 */
function fitProfile(spriteId: string, panel: Record<string, number>) {
  const sprite = bundle.sprites[spriteId];
  const target: Record<string, [number, number]> = {};
  for (const k of ["hp", "atk", "spatk", "defense", "spdef", "speed"]) target[k] = [panel[k], panel[k]];
  for (const pad of [0, 1, 2, 3]) {
    const t: Record<string, [number, number]> = {};
    for (const k of Object.keys(target)) t[k] = [panel[k] - pad, panel[k] + pad];
    const cands = inferBuild((sprite.race ?? {}) as never, t as never, { level: 60, stars: [5], stats: bundle.stats });
    if (cands.length) {
      const c = cands[0];
      return { profile: { level: 60, stars: 5, nature: null, iv: buildIv(c, sprite) }, matched: pad === 0, cands: cands.length };
    }
  }
  return { profile: { level: 60, stars: 5, nature: null, iv: {} }, matched: false, cands: 0 };
}
function buildIv(c: { iv: Partial<Record<string, number>> }, _sprite: Dict): Record<string, number> {
  const iv: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.iv)) iv[k] = Number(v);
  return iv;
}

function makeSprite(spriteId: string, skillIds: string[], profile: never, maxHp?: number): ActiveSprite {
  const sprite = bundle.sprites[spriteId];
  const a = makeActive(spriteId, { hp: maxHp ?? 1, maxHp: maxHp ?? 1, energy: 10, profile });
  a.loadout = skillIds.slice();
  a.element = Array.isArray(sprite.elements) ? (sprite.elements as string[]).slice() : [];
  a.carryElements = [...new Set(skillIds.map((id) => String(bundle.skills[id]?.element ?? "")).filter(Boolean))];
  a.entered = false;
  return a;
}

function makeTeamPlayer(members: MemberSpec[], leadName: string): { side: SideState; log: string[] } {
  const log: string[] = [];
  const built = members.map((m) => {
    const id = spriteByName(m.name);
    const skillIds = m.skills.map(skillByName);
    const fit = fitProfile(id, m.panel);
    log.push(`${m.name} ${id} profile=${fit.matched ? "精确" : "放宽"} (${fit.cands} 解) iv=${JSON.stringify(fit.profile.iv)}`);
    return { name: m.name, id, skillIds, active: makeSprite(id, skillIds, fit.profile as never, m.panel.hp) };
  });
  const lead = built.find((b) => b.name === leadName) ?? built[0];
  const bench = built.filter((b) => b !== lead).map((b) => b.active);
  return { side: makeSide(lead.active, { bench, magic: 4 }), log };
}

function makeTeamEnemy(members: { name: string; skills: string[] }[], leadName: string): SideState {
  const built = members.map((m) => {
    const id = spriteByName(m.name);
    const skillIds = m.skills.map(skillByName);
    const profile = { level: 60, stars: 5, nature: null, iv: {} };
    const maxHp = computeStats(bundle.stats, bundle.sprites[id], profile).hp;
    const active = makeSprite(id, skillIds, profile as never, maxHp);
    active.maxHp = maxHp;
    active.hp = maxHp;
    return { name: m.name, active };
  });
  const lead = built.find((b) => b.name === leadName) ?? built[0];
  const bench = built.filter((b) => b !== lead).map((b) => b.active);
  return makeSide(lead.active, { bench, magic: 4 });
}

// ---------------------------------------------------------------- 动作

const sk = (name: string): Action => ({ kind: "skill", skillId: skillByName(name) });
const sw = (name: string): Action => ({ kind: "switch", benchId: spriteByName(name) });
const en: Action = { kind: "energy" };
const magic: Action = { kind: "magic" };

interface Turn {
  p: Action;
  e: Action;
  note: string;
}

const TURNS_A: Turn[] = [
  { p: sk("水泡盾"), e: sk("虫群过境"), note: "水灵501→485(-16); 铠甲虫100%" },
  { p: sk("水炮"), e: sk("吓退"), note: "铠甲虫→75%" },
  { p: sw("火羽"), e: en, note: "我方换火羽" },
  { p: sk("回旋风暴"), e: sw("锤头鹳"), note: "敌方换锤头鹳; 火羽→锤头鹳?→65%" },
  { p: en, e: sk("潮涌"), note: "火羽354→65(-289)" },
  { p: sw("寂灭骨龙"), e: sw("尖嘴狐仙"), note: "双方换人" },
  { p: sk("力量增效"), e: sk("火焰护盾"), note: "" },
  { p: sk("隼鳞"), e: en, note: "尖嘴狐仙→0%(~2:33阵亡)" },
  { p: en, e: sw("恶魔红钻"), note: "敌方换恶魔红钻" },
  { p: sk("先发制人"), e: sk("力量增效"), note: "恶魔红钻→61%" },
  { p: sk("报复"), e: sk("下注"), note: "寂灭骨龙425→255(-145)" },
  { p: sw("火羽"), e: en, note: "我方换火羽" },
  { p: en, e: en, note: "(3:33 敌方技能未捕获)" },
  { p: sw("寂灭骨龙"), e: en, note: "我方换寂灭骨龙; 寂灭骨龙255→211" },
  { p: en, e: sw("锤头鹳"), note: "敌方换锤头鹳" },
  { p: en, e: sk("潮涌"), note: "寂灭骨龙→156" },
  { p: en, e: sk("水炮"), note: "" },
  { p: en, e: en, note: "(4:08 我方技能未捕获 ★0)" },
  { p: en, e: sw("恶魔红钻"), note: "敌方换恶魔红钻" },
  { p: en, e: en, note: "(4:22 我方技能未捕获 ★5); 恶魔红钻阵亡" },
  { p: en, e: sw("花衣蝶"), note: "敌方换花衣蝶" },
  { p: sw("火羽"), e: en, note: "我方换火羽 65/354" },
  { p: en, e: sk("飞断"), note: "火羽65→57(-8)" },
  { p: en, e: sw("锤头鹳"), note: "敌方换锤头鹳65%" },
  { p: sk("怒火"), e: en, note: "" },
  { p: en, e: sk("晒太阳"), note: "" },
  { p: sk("回旋风暴"), e: en, note: "" },
  { p: en, e: en, note: "锤头鹳→29%（聚能）" },
  { p: sk("回旋风暴"), e: en, note: "锤头鹳→0%(~5:42阵亡)" },
  { p: en, e: sw("花衣蝶"), note: "敌方换花衣蝶" },
  { p: en, e: en, note: "(5:58 敌方技能未捕获); 火羽1/354" },
  { p: en, e: sw("铠甲虫"), note: "敌方换铠甲虫75%" },
  { p: sk("回旋风暴"), e: en, note: "" },
  { p: en, e: en, note: "铠甲虫→14%→1%" },
  { p: en, e: sk("假冒"), note: "" },
  { p: sk("回旋风暴"), e: en, note: "铠甲虫→1%（近结束）" },
];

// ---------------------------------------------------------------- 回放

function activeOf(s: SideState): ActiveSprite {
  return s.active;
}

function label(a: ActiveSprite): string {
  const sp = bundle.sprites[a.spriteId];
  return String(sp?.name ?? a.spriteId);
}

function summarizeAction(a: Action): string {
  if (a.kind === "switch") return `换出→${label({ spriteId: a.benchId ?? "" } as ActiveSprite)}`;
  if (a.kind === "skill") return `使用 ${String(bundle.skills[a.skillId ?? ""]?.skillName ?? a.skillId)}`;
  if (a.kind === "energy") return "聚能";
  return a.kind;
}

function runLog(title: string, playerSide: SideState, enemySide: SideState, turns: Turn[]) {
  console.log(`\n================ ${title} ================`);
  const sim = new Simulator(bundle);
  let state = makeState(playerSide, enemySide, { seed: 1 });
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const p0 = activeOf(state.player);
    const e0 = activeOf(state.enemy);
    const pBefore = p0.hp;
    const eBefore = e0.hp;
    let r;
    try {
      r = sim.step(state, t.p, t.e, new Rng(i + 1));
    } catch (err) {
      console.log(`T${i + 1} 异常: ${(err as Error).message}`);
      continue;
    }
    state = r.state;
    const pAfter = activeOf(state.player);
    const eAfter = activeOf(state.enemy);
    const dmg = r.events
      .filter((ev) => /damage|faint|heal/i.test(ev.type))
      .map((ev) => `${ev.type}${ev.side ? "@" + ev.side : ""}${typeof ev.data?.damage === "number" ? "=" + ev.data.damage : ""}`)
      .join(", ");
    const pSwitched = t.p.kind === "switch" ? `→${label(pAfter)}` : "";
    const eSwitched = t.e.kind === "switch" ? `→${label(eAfter)}` : "";
    console.log(
      `T${String(i + 1).padStart(2)} 我[${label(p0)}${pSwitched}] ${summarizeAction(t.p)} | 敌[${label(e0)}${eSwitched}] ${summarizeAction(t.e)}` +
        `\n     引擎: 我HP ${pBefore}→${pAfter.hp}/${pAfter.maxHp}${p0.spriteId !== pAfter.spriteId ? "(换)" : ""}; 敌HP ${eBefore}→${eAfter.hp}/${eAfter.maxHp}${e0.spriteId !== eAfter.spriteId ? "(换)" : ""}  ${dmg}` +
        `\n     实测: ${t.note}`,
    );
  }
}

console.log("—— 我方养成反解 ——");
const { side: playerA, log: plog } = makeTeamPlayer(TEAM_A_PLAYER, "水灵");
plog.forEach((l) => console.log("  " + l));
const enemyA = makeTeamEnemy(TEAM_A_ENEMY, "铠甲虫");
runLog("视频A · 实骨 vs KINGAXE（近似走一遍）", playerA, enemyA, TURNS_A);
