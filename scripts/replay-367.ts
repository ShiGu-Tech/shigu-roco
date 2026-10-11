/** 367s 全场回放：按横幅动作序列喂引擎，逐回合对比实录血条。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, computeStats, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, SideState } from "../apps/web/src/modules/engine";

const b = getBundle();
const spByName = (n: string) => { const h = Object.values(b.sprites).find((s) => String(s.name).startsWith(n)); if (!h) throw new Error("缺 " + n); return String(h.id); };
const skByName = (n: string) => { const h = Object.values(b.skills).find((s) => s.skillName === n); if (!h) throw new Error("缺技能 " + n); return String(h.id); };
const NEU = { level: 60, stars: 5, nature: null, iv: {} } as never;
function mk(name: string, hp: number): ActiveSprite {
  const id = spByName(name); const s = b.sprites[id];
  const a = makeActive(id, { hp, maxHp: hp, energy: 10, profile: NEU });
  a.loadout = (s.skillList as string[]).slice(0, 8); a.element = s.elements as string[]; return a;
}
// 我方队伍（物种，maxHp 按实录顶栏）
const OUR: [string, number][] = [["翠顶夫人", 501], ["深渊蛙", 476], ["音速犬", 366], ["朔夜伊芙", 391], ["皇家狮鹫", 406], ["寂灭骨龙", 400]];
const ENM = ["雪影娃娃", "月牙雪熊", "伊兰亚龙", "饮雪狂兽", "卡瓦重", "寂灭骨龙"];
function team(lead: string, list: [string, number][]): SideState {
  const built = list.map(([n, hp], i) => ({ n, a: mk(n, hp), i }));
  const li = built.findIndex((x) => x.n.startsWith(lead));
  const lead0 = built[li < 0 ? 0 : li];
  return makeSide(lead0.a, { bench: built.filter((x) => x !== lead0).map((x) => x.a) });
}
function teamE(lead: string): SideState {
  const built = ENM.map((n) => ({ n, a: mk(n, computeStats(b.stats, b.sprites[spByName(n)], NEU).hp) }));
  const li = built.findIndex((x) => x.n.startsWith(lead));
  const lead0 = built[li < 0 ? 0 : li];
  return makeSide(lead0.a, { bench: built.filter((x) => x !== lead0).map((x) => x.a) });
}
const sk = (n: string): Action => ({ kind: "skill", skillId: skByName(n) });
const sw = (n: string): Action => ({ kind: "switch", benchId: spByName(n) });
const en: Action = { kind: "energy" };
interface T { p: Action; e: Action; note: string }
const TURNS: T[] = [
  { p: sk("水刃"), e: sk("暴风雪"), note: "我501; 敌100→85" },
  { p: sk("力量增效"), e: sk("冬至"), note: "我501→442→346" },
  { p: sw("深渊蛙"), e: sw("饮雪狂兽"), note: "双方换人" },
  { p: sk("斩断"), e: sk("力量增效"), note: "敌84%→" },
  { p: sk("防御"), e: sk("先发制人"), note: "我476→456→439" },
  { p: sw("音速犬"), e: sk("先发制人"), note: "我→366" },
  { p: sw("朔夜伊芙"), e: sw("寂灭骨龙"), note: "我→391" },
  { p: sw("音速犬"), e: sw("卡瓦重"), note: "我→366" },
  { p: sk("火云车"), e: sk("跺地"), note: "敌67→51" },
  { p: sk("跌落"), e: sw("雪影娃娃"), note: "敌换人→100" },
  { p: en, e: en, note: "聚能" },
  { p: sw("皇家狮鹫"), e: sw("月牙雪熊"), note: "我→406" },
  { p: sk("羽化加速"), e: en, note: "" },
  { p: sk("啄击"), e: en, note: "" },
  { p: sk("啄击"), e: en, note: "敌56→1→0" },
  { p: sw("翠顶夫人"), e: sw("寂灭骨龙"), note: "我→328/501" },
  { p: en, e: sw("伊兰亚龙"), note: "" },
  { p: sw("音速犬"), e: sk("报复"), note: "我→366" },
  { p: en, e: sk("先发制人"), note: "我366→262; 敌46" },
  { p: sk("跌落"), e: sk("先发制人"), note: "我→0(阵亡)" },
];
const sim = new Simulator(b);
let st = makeState(team("翠顶夫人", OUR), teamE("雪影娃娃"), { seed: 1 });
const nm = (a: ActiveSprite) => String(b.sprites[a.spriteId]?.name ?? a.spriteId);
for (let i = 0; i < TURNS.length; i++) {
  const t = TURNS[i];
  const p0 = st.player.active, e0 = st.enemy.active, pb = p0.hp, eb = e0.hp;
  let r; try { r = sim.step(st, t.p, t.e, new Rng(i + 1)); } catch (err) { console.log(`T${i + 1} 异常 ${(err as Error).message}`); continue; }
  st = r.state;
  console.log(`T${String(i + 1).padStart(2)} 我[${nm(p0)}]${t.p.kind === "switch" ? "换→" + nm(st.player.active) : t.p.kind === "energy" ? "聚能" : b.skills[t.p.skillId ?? ""]?.skillName} | 敌[${nm(e0)}]${t.e.kind === "switch" ? "换→" + nm(st.enemy.active) : t.e.kind === "energy" ? "聚能" : b.skills[t.e.skillId ?? ""]?.skillName}`);
  console.log(`     引擎: 我 ${pb}→${st.player.active.hp}/${st.player.active.maxHp}${p0.spriteId !== st.player.active.spriteId ? "(换)" : ""}; 敌 ${eb}→${st.enemy.active.hp}/${st.enemy.active.maxHp}  实录: ${t.note}`);
}
