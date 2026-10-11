/** 367s 流程 · 引擎日志（按用户核对后的动作序） */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, SideState } from "../apps/web/src/modules/engine";

const b = getBundle();
const NEU = { level: 60, stars: 5, nature: null, iv: {} } as never;
const spBy = (n: string) => { const h = Object.values(b.sprites as any).find((s: any) => String(s.name).startsWith(n)); if (!h) throw new Error("缺精灵 " + n); return h as any; };
const skBy = (n: string) => { const h = Object.values(b.skills as any).find((s: any) => s.skillName === n); if (!h) throw new Error("缺技能 " + n); return h as any; };
const nm = (a: ActiveSprite) => String((b.sprites as any)[a.spriteId]?.name ?? a.spriteId);
function mk(name: string, hp: number, need?: string): ActiveSprite {
  const s = spBy(name);
  const a = makeActive(s.id, { hp, maxHp: hp, energy: 10, profile: NEU });
  const set = new Set<string>(s.skillList as string[]);
  if (need) set.add(skBy(need).id);
  a.loadout = [...set]; a.element = s.elements as string[]; return a;
}
const OUR: [string, number][] = [["翠顶夫人", 501], ["深渊蛙", 476], ["音速犬", 366], ["朔夜伊芙", 391], ["皇家狮鹫", 406]];
const ENM: [string, number][] = [["雪影娃娃", 400], ["饮雪狂兽", 400], ["月牙雪熊", 400], ["寂灭骨龙", 400], ["卡瓦重", 400]];
function build(lead: string, list: [string, number][], needs: Record<string,string>): SideState {
  const built = list.map(([n, hp]) => ({ n, a: mk(n, hp, needs[n]) }));
  const i = Math.max(0, built.findIndex((x) => x.n.startsWith(lead)));
  const L = built[i];
  return makeSide(L.a, { bench: built.filter((x) => x !== L).map((x) => x.a) });
}
// 我方: 翠顶夫人/深渊蛙/音速犬/朔夜伊芙/皇家狮鹫 ; 敌方: 雪影/饮雪狂兽/雪熊/骨龙/卡瓦重
const sk = (n: string): Action => (n === "聚能" ? { kind: "energy" } : { kind: "skill", skillId: skBy(n).id });
const sw = (n: string): Action => ({ kind: "switch", benchId: spBy(n).id });
const en: Action = { kind: "energy" };
const TURNS: { p: Action; e: Action }[] = [
  { p: sk("水刃"), e: sk("暴风雪") },
  { p: sk("力量增效"), e: sk("冬至") },
  { p: sw("深渊蛙"), e: sw("饮雪狂兽") },
  { p: sk("斩断"), e: sk("力量增效") },
  { p: sk("防御"), e: sw("月牙雪熊") },
  { p: sk("防御"), e: sk("先发制人") },
  { p: sk("防御"), e: sk("先发制人") },
  { p: sw("音速犬"), e: en },
  { p: sw("朔夜伊芙"), e: sk("先发制人") },
  { p: sw("音速犬"), e: sw("寂灭骨龙") },
  { p: sk("火云车"), e: en },
  { p: sk("跌落"), e: en },
  { p: en, e: sw("卡瓦重") },
  { p: en, e: sk("冬至") },
  { p: sk("聚能"), e: en },
  { p: sw("皇家狮鹫"), e: sk("跺地") },
  { p: sk("羽化加速"), e: en },
  { p: sk("啄击"), e: sw("雪影娃娃") },
  { p: sk("啄击"), e: en },
  { p: sk("啄击"), e: sw("月牙雪熊") },
  { p: sw("翠顶夫人"), e: sk("风隐") },
  { p: sk("风隐"), e: en },
  { p: sw("音速犬"), e: sk("报复") },
  { p: sk("聚能"), e: sk("先发制人") },
  { p: sk("跌落"), e: sk("先发制人") },
];
const sim = new Simulator(b);
let st = makeState(
  build("翠顶夫人", OUR, { 深渊蛙: "斩断", 音速犬: "火云车", 皇家狮鹫: "羽化加速", 翠顶夫人: "水刃" }),
  build("雪影娃娃", ENM, { 雪影娃娃: "暴风雪", 月牙雪熊: "先发制人", 卡瓦重: "冬至", 寂灭骨龙: "报复" }),
  { seed: 1 },
);
const fmt = (ev: any) => {
  const d = ev.data ?? {};
  const v = d.value ?? d.after ?? "";
  return `${ev.type}(${ev.side})${v !== "" ? " " + JSON.stringify(v) : ""}`;
};
for (let i = 0; i < TURNS.length; i++) {
  const t = TURNS[i];
  const pa = st.player.active, ea = st.enemy.active;
  const label = (a: ActiveSprite, act: Action) => act.kind === "skill" ? `${nm(a)}·${(b.skills as any)[act.skillId!]?.skillName}` : act.kind === "switch" ? `换→${nm({ spriteId: act.benchId } as any)}` : "聚能";
  try {
    const r = sim.step(st, t.p, t.e, new Rng(i + 1));
    st = r.state;
    console.log(`\n[回合 ${i + 1}] 我: ${label(pa, t.p)}  |  敌: ${label(ea, t.e)}`);
    for (const ev of r.events) console.log("    " + fmt(ev));
    console.log(`    → 我 ${nm(st.player.active)} ${st.player.active.hp}/${st.player.active.maxHp}  |  敌 ${nm(st.enemy.active)} ${st.enemy.active.hp}/${st.enemy.active.maxHp}`);
  } catch (err) {
    console.log(`\n[回合 ${i + 1}] !!! 异常: ${(err as Error).message}`);
    break;
  }
}
