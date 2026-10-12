/** 367s 演示局：我方逐回合指定动作（含状态技），敌方启发式，逐回合打印引擎结算。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState, typeMultiplier, computeStats } from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, Side, SideState } from "../apps/web/src/modules/engine";
const b: any = getBundle();
const spB = (n: string) => { const h = Object.values(b.sprites as any).find((s: any) => String(s.name).startsWith(n)); if (!h) throw new Error("缺 " + n); return h as any; };
const skB = (n: string) => Object.values(b.skills as any).find((s: any) => s.skillName === n) as any;
const P = (n: string | null, iv: Record<string, number>) => ({ level: 60, stars: 5, nature: n, iv } as any);
const nameOf = (a: ActiveSprite) => String(b.sprites[a.spriteId]?.name ?? a.spriteId);
function mk(name: string, prof: any, skills: string[]): ActiveSprite {
  const s = spB(name); const hp = computeStats(b.stats, s, prof).hp;
  const a = makeActive(s.id, { hp, maxHp: hp, energy: 10, profile: prof });
  const have = new Set<string>(s.skillList as string[]);
  const picked = skills.map((n) => skB(n)).filter((x: any) => x && have.has(x.id)).map((x: any) => x.id);
  const extra = (s.skillList as string[]).map((id) => b.skills[id]).sort((x: any, y: any) => (y.power ?? 0) - (x.power ?? 0));
  for (const e of extra) { if (picked.length >= 4) break; if (!picked.includes(e.id)) picked.push(e.id); }
  a.loadout = picked; a.element = s.elements; return a;
}
const OUR: [string, any, string[]][] = [
  ["翠顶夫人", P("hp_spatk", { hp: 60, defense: 60, spdef: 60 }), ["水炮", "力量增效", "防御", "镜像反射"]],
  ["音速犬", P("jolly", { speed: 60, atk: 60, hp: 60 }), ["力量增效", "火云车", "焚烧烙印", "跌落"]],
  ["深渊蛙", P("hp_spatk", { hp: 60, atk: 60, speed: 60 }), ["网缚", "斩断", "三连破", "快速移动"]],
  ["皇家狮鹫", P("jolly", { speed: 60, atk: 60, hp: 60 }), ["冰爪", "羽刃", "羽化加速", "乘胜追击"]],
  ["朔夜伊芙", P("modest", { spatk: 60, speed: 60, hp: 60 }), ["麻痹", "掠夺", "欺诈契约", "下注"]],
];
const ENM: [string, any, string[]][] = [
  ["雪影娃娃", P("atk_spdef", { atk: 60, speed: 60, hp: 60 }), ["暴风雪", "冬至", "碎冰冰", "冻结"]],
  ["月牙雪熊", P("neutral", { hp: 60, defense: 60, spdef: 60 }), ["先发制人", "冰爪", "暴风雪", "硬邦邦"]],
  ["寂灭骨龙", P("impish", { defense: 60, hp: 60, spdef: 60 }), ["报复", "先发制人", "穿膛", "龙爪"]],
  ["卡瓦重", P("neutral", {}), ["跺地", "冬至", "麦芒", "重踏"]],
];
function team(list: [string, any, string[]][]): SideState {
  const built = list.map(([n, p, s]) => mk(n, p, s));
  return makeSide(built[0], { bench: built.slice(1) });
}
const sim = new Simulator(b);
const elsOf = (id: string) => (b.sprites[id]?.elements ?? []) as string[];
function enemyAct(st: any, si: Side): Action {
  const legal: Action[] = sim.legalActions(st, si);
  const me = st[si].active;
  if (me.hp <= 0) { const sw = legal.filter((a) => a.kind === "switch"); if (sw.length) return sw[0]; }
  const opp = st[si === "player" ? "enemy" : "player"].active;
  const oppEls = elsOf(opp.spriteId);
  const sc = (a: Action) => { const s = b.skills[a.skillId!]; if (!s || !/Physical|Magic/.test(String(s.category))) return -1; const el = Array.isArray(s.element) ? s.element : [s.element]; let m = 1; for (const e of el) m = Math.max(m, typeMultiplier(b.elements, e, oppEls)); return (s.power ?? 0) * m; };
  const atk = legal.filter((a) => sc(a) > 0).sort((x, y) => sc(y) - sc(x));
  return atk[0] ?? legal.find((a) => a.kind === "energy") ?? { kind: "energy" };
}
// 我方逐回合指令
const sk = (n: string): Action => ({ kind: "skill", skillId: skB(n).id });
const sw = (n: string): Action => ({ kind: "switch", benchId: spB(n).id });
const PLAN: Action[] = [
  sk("力量增效"), sk("水炮"), sw("音速犬"), sk("力量增效"), sk("火云车"), sk("焚烧烙印"),
  sw("深渊蛙"), sk("网缚"), sk("斩断"), sk("三连破"),
  sw("皇家狮鹫"), sk("冰爪"), sk("羽刃"), sk("乘胜追击"),
  sw("朔夜伊芙"), sk("麻痹"), sk("掠夺"), sk("欺诈契约"),
];
const rng = new Rng(7);
let st = makeState(team(OUR), team(ENM), { seed: 7 });
const show = (tag: string) => {
  const p = st.player.active, e = st.enemy.active;
  const fmt = (x: ActiveSprite) => `${nameOf(x)} ${x.hp}/${x.maxHp} 能量${x.energy} ${x.statuses && Object.keys(x.statuses).length ? "状态" + JSON.stringify(x.statuses) : ""} ${x.buffs && Object.keys(x.buffs).length ? "buff" + JSON.stringify(x.buffs) : ""}${x.debuffs && Object.keys(x.debuffs).length ? "debuff" + JSON.stringify(x.debuffs) : ""}`;
  console.log(`  ${tag} 我[${fmt(p)}] 敌[${fmt(e)}]`);
};
console.log(`开局：我 ${nameOf(st.player.active)} | 敌 ${nameOf(st.enemy.active)}\n`);
for (let i = 0; i < 45; i++) {
  const term = sim.terminal(st); if (term.ended) break;
  let pa = i < PLAN.length ? PLAN[i] : enemyAct(st, "player");
  if (st.player.active.hp <= 0) { const sw = sim.legalActions(st, "player").filter((a) => a.kind === "switch"); if (sw.length) pa = sw[0]; }
  const ea = enemyAct(st, "enemy");
  console.log(`【回合 ${i + 1}】我: ${pa.kind === "skill" ? b.skills[pa.skillId!]?.skillName : pa.kind === "switch" ? "换→" + nameOf({ spriteId: pa.benchId } as any) : "聚能"} ｜ 敌: ${ea.kind === "skill" ? b.skills[ea.skillId!]?.skillName : ea.kind === "switch" ? "换→" + nameOf({ spriteId: ea.benchId } as any) : ea.kind}`);
  try {
    const r = sim.step(st, pa, ea, rng); st = r.state;
    for (const ev of r.events) {
      if (/damage|faint|status-applied|mark-applied|stat-modified|buff-gained|debuff-gained|heal|weather|switch|escape|revive|status-removed|mark-consumed|status-immune|energy|priority/.test(ev.type)) {
        const d = ev.data ?? {}; const v = d.value ?? d.side ?? "";
        console.log(`    · ${ev.type}${ev.side ? "(" + ev.side + ")" : ""}${v !== "" ? " " + JSON.stringify(v) : ""}${d.statusId ? " [" + d.statusId + "]" : ""}${d.markId ? " [" + d.markId + "]" : ""}`);
      }
    }
    show("→");
  } catch (err) { console.log(`    !!! ${(err as Error).message}`); break; }
}
const t = sim.terminal(st);
console.log(`\n结果：${t.ended ? (t.winner === "player" ? "我方胜" : t.winner === "enemy" ? "敌方胜" : "平局") + "（" + t.reason + "）" : "未结束"}`);
