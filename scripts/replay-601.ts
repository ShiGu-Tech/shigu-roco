/** 601s（实骨 vs 秋色残青栀）回放：我方按横幅动作、敌方启发式，逐回合打印引擎结算。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState, typeMultiplier, computeStats } from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, Side, SideState } from "../apps/web/src/modules/engine";
const b: any = getBundle();
const spB = (n: string) => { const h = Object.values(b.sprites as any).find((s: any) => String(s.name).startsWith(n)); if (!h) throw new Error("缺 " + n); return h as any; };
const skB = (n: string) => Object.values(b.skills as any).find((s: any) => s.skillName === n) as any;
const P = (nat: string | null, iv: Record<string, number>) => ({ level: 60, stars: 5, nature: nat, iv } as any);
const nameOf = (a: ActiveSprite) => String(b.sprites[a.spriteId]?.name ?? a.spriteId);
function mk(name: string, skills: string[]): ActiveSprite {
  const s = spB(name); const prof = P(null, {});
  const hp = computeStats(b.stats, s, prof).hp;
  const a = makeActive(s.id, { hp, maxHp: hp, energy: 10, profile: prof });
  const have = new Set<string>(s.skillList as string[]);
  const picked = skills.map((n) => skB(n)).filter((x: any) => x && have.has(x.id)).map((x: any) => x.id);
  const extra = (s.skillList as string[]).map((id) => b.skills[id]).sort((x: any, y: any) => (y.power ?? 0) - (x.power ?? 0));
  for (const e of extra) { if (picked.length >= 5) break; if (!picked.includes(e.id)) picked.push(e.id); }
  a.loadout = picked; a.element = s.elements; return a;
}
const OUR: [string, string[]][] = [
  ["迪莫", ["突击", "潮涌"]], ["火神", ["怒火", "闪燃", "吹火"]],
  ["武斗酷猫", ["光合作用", "光能聚集", "移花接木"]], ["岚鸟", ["龙卷风", "飞羽"]], ["水灵", ["水弹枪", "水泡盾", "水炮"]], ["花影羚羊", ["坟场搏击"]],
];
const ENM: [string, string[]][] = [
  ["闪电鳗鱼", ["双联脉冲", "泡沫幻影"]], ["飞飞钥", ["飞羽"]], ["星光狮", ["雷暴"]],
  ["伊兰亚龙", ["聚能"]], ["绒光优优", ["毒孢子"]], ["尖嘴狐仙", ["焚烧烙印", "高温回火"]],
];
function team(list: [string, string[]][]): SideState {
  const built = list.map(([n, s]) => mk(n, s));
  return makeSide(built[0], { bench: built.slice(1) });
}
const sim = new Simulator(b);
const elsOf = (id: string) => (b.sprites[id]?.elements ?? []) as string[];
// 蓄力技（含 beginCharge）不在启发式里直接选（首回合 0 伤）。
const CHARGE = new Set<string>((b.mechanisms ?? []).filter((m: any) => JSON.stringify(m.effects ?? []).includes("beginCharge")).map((m: any) => String(m.ownerId)));
function act(st: any, si: Side): Action {
  const legal: Action[] = sim.legalActions(st, si);
  const me = st[si].active;
  if (me.hp <= 0) { const sw = legal.filter((a) => a.kind === "switch"); if (sw.length) return sw[0]; }
  const opp = st[si === "player" ? "enemy" : "player"].active;
  const oppEls = elsOf(opp.spriteId);
  const sc = (a: Action) => { const s = b.skills[a.skillId!]; if (!s || !/Physical|Magic/.test(String(s.category))) return -1; const el = Array.isArray(s.element) ? s.element : [s.element]; let m = 1; for (const e of el) m = Math.max(m, typeMultiplier(b.elements, e, oppEls)); return (s.power ?? 0) * m; };
  return legal.filter((a) => a.kind === "skill" && !CHARGE.has(a.skillId!) && sc(a) > 0).sort((x, y) => sc(y) - sc(x))[0] ?? legal.find((a) => a.kind === "energy") ?? { kind: "energy" };
}
// 我方脚本动作（按横幅最佳还原，含 buff 叠加循环）
const sk = (n: string): Action => (n === "聚能" ? { kind: "energy" } : { kind: "skill", skillId: skB(n).id });
const sw = (n: string): Action => ({ kind: "switch", benchId: spB(n).id });
const OUR_PLAN: (Action | "auto")[] = [
  "auto", "auto", sw("火神"), sk("闪燃"), sw("水灵"), sk("水泡盾"), sk("水炮"), sk("水弹枪"),
  sw("花影羚羊"), sk("坟场搏击"), sw("武斗酷猫"), sk("光合作用"), sk("光能聚集"), sk("移花接木"), sk("光合作用"), sk("光能聚集"),
  sw("岚鸟"), sk("龙卷风"), sk("飞羽"),
];
const rng = new Rng(11);
let st = makeState(team(OUR), team(ENM), { seed: 11 });
console.log("开局：我 " + nameOf(st.player.active) + " vs 敌 " + nameOf(st.enemy.active) + "\n");
for (let i = 0; i < OUR_PLAN.length; i++) {
  const term = sim.terminal(st); if (term.ended) break;
  let pa = OUR_PLAN[i] === "auto" ? act(st, "player") : OUR_PLAN[i] as Action;
  if (st.player.active.hp <= 0) { const s = sim.legalActions(st, "player").filter((a) => a.kind === "switch"); if (s.length) pa = s[0]; }
  const ea = act(st, "enemy");
  const lbl = (a: Action) => a.kind === "skill" ? (b.skills[a.skillId!]?.skillName ?? "?") : a.kind === "switch" ? "换→" + nameOf({ spriteId: a.benchId } as any) : "聚能";
  try {
    const r = sim.step(st, pa, ea, rng); st = r.state;
    const dmg = r.events.filter((e: any) => /damage/.test(e.type)).map((e: any) => `${e.side}=${e.data.value}`);
    const fx = r.events.filter((e: any) => /buff-gained|debuff-gained|stat-modified|status-applied|status-removed|mark-applied|mark-consumed|heal|weather-changed|revive|faint|priority|escape/.test(e.type)).map((e: any) => { const d = e.data ?? {}; return `${e.type}(${e.side})${d.value !== undefined ? " " + JSON.stringify(d.value) : d.statusId ? "[" + d.statusId + "]" : d.markId ? "[" + d.markId + "]" : ""}`; });
    console.log(`[${i + 1}] 我:${lbl(pa)} 敌:${lbl(ea)}  ${dmg.join(" ")}`);
    if (fx.length) console.log(`     效果: ${fx.join("  ")}`);
    const stt = (a: ActiveSprite) => [a.buffs && Object.keys(a.buffs).length ? "buff" + JSON.stringify(a.buffs) : "", a.debuffs && Object.keys(a.debuffs).length ? "debuff" + JSON.stringify(a.debuffs) : "", a.statuses && Object.keys(a.statuses).length ? "状态" + JSON.stringify(a.statuses) : "", a.marks && Object.keys(a.marks).length ? "印记" + JSON.stringify(a.marks) : ""].filter(Boolean).join(" ");
    console.log(`     我 ${nameOf(st.player.active)} ${st.player.active.hp}/${st.player.active.maxHp} ${stt(st.player.active)} | 敌 ${nameOf(st.enemy.active)} ${st.enemy.active.hp}/${st.enemy.active.maxHp} ${stt(st.enemy.active)}`);
  } catch (err) { console.log(`[${i + 1}] !!! ${(err as Error).message}`); break; }
}
const t = sim.terminal(st);
console.log("\n结果：" + (t.ended ? (t.winner === "player" ? "我方胜" : t.winner === "enemy" ? "敌方胜" : "平") + "（" + t.reason + "）" : "未结束"));
