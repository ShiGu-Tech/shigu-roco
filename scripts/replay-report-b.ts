/** 视频 B 回放：把我方 6 只反解 + 逐动作喂引擎，打印「引擎 vs 实录」。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, computeStats, inferBuild, makeActive, makeSide, makeState, PANEL_ORDER } from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, DataBundle, SideState } from "../apps/web/src/modules/engine";

const bundle: DataBundle = getBundle();
const spriteByName = (n: string) => { const h = Object.values(bundle.sprites).find((s) => s.name === n || s.nameZh === n); if (!h) throw new Error("缺精灵 " + n); return String(h.id); };
const skillByName = (n: string) => { const h = Object.values(bundle.skills).find((s) => s.skillName === n || s.nameZh === n); if (!h) throw new Error("缺技能 " + n); return String(h.id); };
type SP = { level: number; stars: number; nature: string | null; iv: Record<string, number> };

interface M { name: string; panel: Record<string, number>; skills: string[] }
const PLAYER: M[] = [
  { name: "绒光优优", panel: { hp: 393, defense: 175, atk: 101, spdef: 203, spatk: 215, speed: 254 }, skills: ["热砂", "硬化", "天光", "退化"] },
  { name: "伊兰亚龙", panel: { hp: 411, defense: 136, atk: 160, spdef: 157, spatk: 302, speed: 220 }, skills: ["绵里藏针", "氧输送", "撒花", "肥皂泡"] },
  { name: "尖嘴狐仙", panel: { hp: 480, defense: 185, atk: 156, spdef: 211, spatk: 156, speed: 158 }, skills: ["暴风雪", "高温回火", "焚烧烙印", "火焰护盾"] },
  { name: "影狸", panel: { hp: 386, defense: 175, atk: 167, spdef: 137, spatk: 209, speed: 273 }, skills: ["毒液渗透", "幽灵爆发", "防御", "嘲弄"] },
  { name: "圣剑-X", panel: { hp: 517, defense: 283, atk: 291, spdef: 250, spatk: 197, speed: 132 }, skills: ["械斗", "鸣沙陷阱", "齿轮切开", "齿轮扭矩"] },
  { name: "布灵布灵", panel: { hp: 362, defense: 195, atk: 220, spdef: 166, spatk: 99, speed: 267 }, skills: ["截拳", "透镜实验", "叠加态", "噬心"] },
];
const ENEMY: { name: string; skills: string[] }[] = [
  { name: "椰浆布丁", skills: ["天洪"] },
  { name: "伊贝粉粉", skills: ["光合作用", "藤绞", "纤维化"] },
  { name: "加油蟹", skills: ["示弱"] },
  { name: "加油海葵", skills: ["击鼓传花"] },
  { name: "罗隐", skills: ["彼岸之手", "泥浆铠甲"] },
  { name: "飞飞钥", skills: ["飞羽", "风隐"] },
  { name: "岚鸟", skills: ["龙卷风"] },
];

function natureId(up: string | null, down: string | null) { return (bundle.stats.natures ?? []).find((n) => (n.up ?? null) === up && (n.down ?? null) === down)?.id ?? null; }
function fit(name: string, panel: Record<string, number>): SP {
  const s = bundle.sprites[spriteByName(name)];
  const t: Record<string, [number, number]> = {}; for (const k of PANEL_ORDER) t[k] = [panel[k], panel[k]];
  const bs = inferBuild(s.race as never, t as never, { level: 60, stars: [5], stats: bundle.stats });
  const c = bs[0] as { nature: { up: string | null; down: string | null }; iv: Record<string, number> } | undefined;
  if (!c) return { level: 60, stars: 5, nature: null, iv: {} };
  console.log(`  fit ${name}: ${c.nature.up ?? "-"}↑/${c.nature.down ?? "-"}↓ iv=${JSON.stringify(c.iv)}`);
  return { level: 60, stars: 5, nature: natureId(c.nature.up, c.nature.down), iv: c.iv };
}
function mk(id: string, skills: string[], profile: SP, hp: number): ActiveSprite {
  const s = bundle.sprites[id];
  const a = makeActive(id, { hp, maxHp: hp, energy: 10, profile: profile as never });
  a.loadout = skills.slice(); a.element = Array.isArray(s.elements) ? (s.elements as string[]) : []; a.entered = false; return a;
}
const neutral: SP = { level: 60, stars: 5, nature: null, iv: {} };
const built = PLAYER.map((m) => { const id = spriteByName(m.name); return { name: m.name, a: mk(id, m.skills.map(skillByName), fit(m.name, m.panel), m.panel.hp) }; });
const lead = built.find((b) => b.name === "圣剑-X")!;
const playerSide = makeSide(lead.a, { bench: built.filter((b) => b !== lead).map((b) => b.a) });
const ebuilt = ENEMY.map((m) => { const id = spriteByName(m.name); const hp = computeStats(bundle.stats, bundle.sprites[id], neutral).hp; return { name: m.name, a: mk(id, m.skills.map(skillByName), neutral, hp) }; });
const elead = ebuilt[0];
const enemySide = makeSide(elead.a, { bench: ebuilt.slice(1).map((b) => b.a) });

const sk = (n: string): Action => ({ kind: "skill", skillId: skillByName(n) });
const sw = (n: string): Action => ({ kind: "switch", benchId: spriteByName(n) });
const en: Action = { kind: "energy" };
interface T { p: Action; e: Action; note: string }
const TURNS: T[] = [
  { p: en, e: sk("天洪"), note: "圣剑-X 517→259(-258)" },
  { p: sk("鸣沙陷阱"), e: en, note: "椰浆布丁→0%" },
  { p: en, e: sw("伊贝粉粉"), note: "换伊贝粉粉" },
  { p: en, e: sk("光合作用"), note: "敌回血" },
  { p: sk("齿轮切开"), e: en, note: "伊贝粉粉→64%" },
  { p: en, e: sk("光合作用"), note: "" },
  { p: sk("齿轮扭矩"), e: en, note: "" },
  { p: en, e: sk("藤绞"), note: "圣剑-X 259→236(-23)" },
  { p: en, e: en, note: "圣剑-X 聚能" },
  { p: sw("尖嘴狐仙"), e: en, note: "换尖嘴狐仙" },
  { p: en, e: sk("纤维化"), note: "" },
  { p: en, e: sw("加油蟹"), note: "换加油蟹" },
  { p: en, e: sk("示弱"), note: "加油蟹→83%" },
  { p: sk("焚烧烙印"), e: en, note: "" },
  { p: sw("影狸"), e: en, note: "换影狸" },
  { p: en, e: sk("击鼓传花"), note: "加油海葵→72%" },
  { p: en, e: sw("罗隐"), note: "换罗隐" },
  { p: sw("伊兰亚龙"), e: en, note: "换伊兰亚龙" },
  { p: en, e: sk("彼岸之手"), note: "伊兰亚龙 411→23(-388)" },
  { p: sw("绒光优优"), e: en, note: "换绒光优优" },
  { p: en, e: sw("伊贝粉粉"), note: "换伊贝粉粉" },
  { p: en, e: sk("藤绞"), note: "绒光优优 393→370(-23)" },
  { p: sk("硬化"), e: en, note: "应对硬化" },
  { p: sw("尖嘴狐仙"), e: en, note: "换尖嘴狐仙" },
  { p: en, e: sk("纤维化"), note: "" },
  { p: en, e: en, note: "(5:44 未捕获)" },
  { p: en, e: sw("飞飞钥"), note: "换飞飞钥" },
  { p: en, e: sk("飞羽"), note: "飞飞钥→56%" },
  { p: sk("高温回火"), e: en, note: "" },
  { p: sw("绒光优优"), e: en, note: "换绒光优优" },
  { p: en, e: sk("风隐"), note: "" },
  { p: en, e: sw("伊贝粉粉"), note: "换伊贝粉粉" },
  { p: en, e: en, note: "(6:44 未捕获)" },
  { p: sw("尖嘴狐仙"), e: en, note: "换尖嘴狐仙" },
  { p: en, e: sk("光合作用"), note: "" },
  { p: en, e: sw("岚鸟"), note: "换岚鸟" },
  { p: sk("焚烧烙印"), e: en, note: "" },
  { p: en, e: sk("龙卷风"), note: "尖嘴狐仙 480→256(-224)" },
  { p: en, e: sw("罗隐"), note: "换罗隐" },
  { p: en, e: en, note: "(7:52 未捕获)" },
  { p: sk("火焰护盾"), e: en, note: "" },
  { p: en, e: sk("泥浆铠甲"), note: "尖嘴狐仙→0(8:21)" },
  { p: sw("绒光优优"), e: en, note: "换绒光优优" },
  { p: en, e: en, note: "(8:46 未捕获) 绒光优优→0; 罗隐→100%" },
  { p: sw("圣剑-X"), e: en, note: "换圣剑-X" },
  { p: en, e: en, note: "(9:06 未捕获) 圣剑-X→0" },
];

console.log("—— 我方养成反解 ——");
const sim = new Simulator(bundle);
let st = makeState(playerSide, enemySide, { seed: 1 });
for (let i = 0; i < TURNS.length; i++) {
  const t = TURNS[i];
  const p0 = st.player.active, e0 = st.enemy.active;
  const pb = p0.hp, eb = e0.hp;
  let r; try { r = sim.step(st, t.p, t.e, new Rng(i + 1)); } catch (err) { console.log(`T${i + 1} err ${(err as Error).message}`); continue; }
  st = r.state;
  const dmg = r.events.filter((ev) => /damage|faint|heal/i.test(ev.type)).map((ev) => `${ev.type}${ev.side ? "@" + ev.side : ""}${typeof (ev.data as Record<string, unknown>)?.value === "number" ? "=" + (ev.data as Record<string, number>).value : ""}`).join(",");
  const nm = (a: ActiveSprite) => String(bundle.sprites[a.spriteId]?.name ?? a.spriteId);
  console.log(`T${String(i + 1).padStart(2)} 我[${nm(p0)}] ${t.p.kind === "switch" ? "换→" + nm(st.player.active) : t.p.kind === "energy" ? "聚能" : bundle.skills[t.p.skillId ?? ""]?.skillName} | 敌[${nm(e0)}] ${t.e.kind === "switch" ? "换→" + nm(st.enemy.active) : t.e.kind === "energy" ? "聚能" : bundle.skills[t.e.skillId ?? ""]?.skillName}`);
  console.log(`     引擎: 我HP ${pb}→${st.player.active.hp}/${st.player.active.maxHp}; 敌HP ${eb}→${st.enemy.active.hp}/${st.enemy.active.maxHp} ${dmg}`);
  console.log(`     实测: ${t.note}`);
}
