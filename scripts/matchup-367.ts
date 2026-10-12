/** 367s 双方 · 配招 + 启发式策略 · 蒙特卡洛胜率。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState, typeMultiplier, computeStats } from "../apps/web/src/modules/engine";
import type { Action, ActiveSprite, Side, SideState } from "../apps/web/src/modules/engine";
const b: any = getBundle();
const spB = (n: string) => { const h = Object.values(b.sprites as any).find((s: any) => String(s.name).startsWith(n)); if (!h) throw new Error("缺 " + n); return h as any; };
const skB = (n: string) => { const h = Object.values(b.skills as any).find((s: any) => s.skillName === n); if (!h) return null; return h as any; };
const P = (nature: string | null, iv: Record<string, number>) => ({ level: 60, stars: 5, nature, iv } as any);

const OUR: [string, any, string[]][] = [
  ["翠顶夫人", P("hp_spatk", { hp: 60, defense: 60, spdef: 60 }), ["水炮", "力量增效", "防御", "镜像反射"]],
  ["深渊蛙", P("hp_spatk", { hp: 60, atk: 60, speed: 60 }), ["斩断", "三连破", "反击拳", "快速移动"]],
  ["音速犬", P("jolly", { speed: 60, atk: 60, hp: 60 }), ["火云车", "跌落", "力量增效", "撕咬"]],
  ["朔夜伊芙", P("modest", { spatk: 60, speed: 60, hp: 60 }), ["掠夺", "蝙蝠", "欺诈契约", "黑手"]],
  ["皇家狮鹫", P("jolly", { speed: 60, atk: 60, hp: 60 }), ["啄击", "羽刃", "乘胜追击", "连续爪击"]],
];
const ENM: [string, any, string[]][] = [
  ["雪影娃娃", P("atk_spdef", { atk: 60, speed: 60, hp: 60 }), ["暴风雪", "冬至", "冰冻光束", "雪花飞舞"]],
  ["饮雪狂兽", P("neutral", {}), ["力量增效", "冰牙", "冷冻拳", "暴风雪"]],
  ["月牙雪熊", P("neutral", { hp: 60, defense: 60, spdef: 60 }), ["先发制人", "冰爪", "暴风雪", "硬邦邦"]],
  ["寂灭骨龙", P("impish", { defense: 60, hp: 60, spdef: 60 }), ["报复", "先发制人", "龙之逆鳞", "龙爪"]],
  ["卡瓦重", P("neutral", {}), ["跺地", "冬至", "岩崩", "重踏"]],
];
function loadout(name: string, names: string[]): string[] {
  const s = spB(name); const have = new Set<string>(s.skillList as string[]);
  const picked = names.map((n) => skB(n)).filter((x: any) => x && have.has(x.id)).map((x: any) => x.id);
  // 不足 4 个时，用本精灵威力最高的补齐
  if (picked.length < 4) {
    const extra = (s.skillList as string[]).map((id) => b.skills[id]).sort((a: any, c: any) => (c.power ?? 0) - (a.power ?? 0));
    for (const e of extra) { if (picked.length >= 5) break; if (!picked.includes(e.id) && (e.power ?? 0) > 0) picked.push(e.id); }
  }
  return picked;
}
function mk(name: string, prof: any, skills: string[]): ActiveSprite {
  const s = spB(name);
  const hp = computeStats(b.stats, s, prof).hp;
  const a = makeActive(s.id, { hp, maxHp: hp, energy: 10, profile: prof });
  a.loadout = loadout(name, skills); a.element = s.elements; return a;
}
function team(list: [string, any, string[]][]): SideState {
  const built = list.map(([n, p, sk]) => mk(n, p, sk));
  return makeSide(built[0], { bench: built.slice(1) });
}
const elsOf = (id: string) => (b.sprites[id]?.elements ?? []) as string[];
function score(a: Action, oppEls: string[]): number {
  const s = b.skills[a.skillId!]; if (!s) return -1;
  const cat = String(s.category ?? "");
  if (!/Physical|Magic/.test(cat)) return -0.5;
  const el = (Array.isArray(s.element) ? s.element : [s.element]) as string[];
  let best = 1; for (const e of el) best = Math.max(best, typeMultiplier(b.elements, e, oppEls));
  return (s.power ?? 0) * best;
}
function heuristic(st: any, side: Side): Action {
  const legal: Action[] = sim.legalActions(st, side);
  const act = st[side].active; const opp = st[side === "player" ? "enemy" : "player"].active;
  const oppEls = elsOf(opp.spriteId);
  const ratio = act.maxHp > 0 ? act.hp / act.maxHp : 1;
  // 1) 血低于 25% 且有健康后备 → 换人
  if (ratio < 0.25) {
    const sw = legal.filter((a) => a.kind === "switch");
    const bench = st[side].bench.filter((x: any) => x.hp > 0).sort((x: any, y: any) => y.hp / y.maxHp - x.hp / x.maxHp);
    if (sw.length && bench.length) { const t = sw.find((a) => a.benchId === bench[0].spriteId); if (t) return t; }
  }
  // 2) 克制/最高威力攻击技（有输出就用）
  const atk = legal.filter((a) => a.kind === "skill" && score(a, oppEls) > 0).sort((x, y) => score(y, oppEls) - score(x, oppEls));
  if (atk.length) return atk[0];
  // 3) 没输出可打才考虑力量增效
  const buff = legal.find((a) => a.kind === "skill" && /力量增效/.test(b.skills[a.skillId!]?.skillName ?? ""));
  if (buff && st.turn <= 3) return buff;
  return legal.find((a) => a.kind === "energy") ?? { kind: "energy" };
}
const sim = new Simulator(b);
const N = Number(process.argv[2] ?? 600);
function run(policy: "random" | "heuristic") {
  const t = { player: 0, enemy: 0, draw: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const rng = new Rng(seed);
    let st = makeState(team(OUR), team(ENM), { seed });
    let term = sim.terminal(st);
    for (let k = 0; k < 100 && !term.ended; k++) {
      const pick = (side: Side): Action => policy === "heuristic" ? heuristic(st, side) : (() => { const l = sim.legalActions(st, side); return l[Math.floor(rng.next() * l.length)] ?? { kind: "energy" }; })();
      const pa = pick("player"), ea = pick("enemy");
      if (process.env.DBG && seed === 1 && k < 12) {
        const nm = (a: Action) => a.kind === "skill" ? (b.skills[a.skillId!]?.skillName ?? "?") : a.kind;
        console.log(`  T${k + 1} 我=${nm(pa)}(HP ${st.player.active.hp}/${st.player.active.maxHp}) 敌=${nm(ea)}(HP ${st.enemy.active.hp}/${st.enemy.active.maxHp})`);
      }
      try { st = sim.step(st, pa, ea, rng).state; } catch { break; }
      term = sim.terminal(st);
    }
    if (term.winner === "player") t.player++;
    else if (term.winner === "enemy") t.enemy++;
    else t.draw++;
  }
  return t;
}
for (const policy of ["random", "heuristic"] as const) {
  const t = run(policy);
  const dec = t.player + t.enemy;
  console.log(`=== ${N} 场 · ${policy === "random" ? "随机出招" : "智能(克制+力量增效+残血换人)"} · 我方5 vs 敌方6 ===`);
  console.log(`  我方胜 ${t.player}  敌方胜 ${t.enemy}  平/上限 ${t.draw}`);
  console.log(`  我方胜率 = ${(t.player / N * 100).toFixed(1)}%（仅分胜负 ${(t.player / Math.max(1, dec) * 100).toFixed(1)}%）\n`);
}
// 打印双方实际配招（便于核对）
console.log("我方配招："); for (const [n, , sk] of OUR) console.log(`  ${n}: ${loadout(n, sk).map((id) => b.skills[id]?.skillName).join(" / ")}`);
console.log("敌方配招："); for (const [n, , sk] of ENM) console.log(`  ${n}: ${loadout(n, sk).map((id) => b.skills[id]?.skillName).join(" / ")}`);
