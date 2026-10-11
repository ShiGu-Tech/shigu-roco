/** 用我方已确认资质 → 引擎面板；再用实录伤害反推敌方资质。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, computeStats, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";
const b: any = getBundle();
const spB = (n: string, v?: string) => { const h = Object.values(b.sprites as any).find((s: any) => String(s.name).startsWith(n) && (!v || String(s.name).includes(v))); if (!h) throw new Error("缺精灵 " + n + (v ?? "")); return h as any; };
const skB = (n: string) => { const h = Object.values(b.skills as any).find((s: any) => s.skillName === n); if (!h) throw new Error("缺技能 " + n); return h as any; };
const P = (nature: string | null, iv: Record<string, number>) => ({ level: 60, stars: 5, nature, iv } as any);

// 我方（已确认）
const OUR = [
  { n: "翠顶夫人", sp: "sp-90-1", p: P("hp_spatk", { hp: 60, defense: 60, spdef: 60 }) },
  { n: "深渊蛙", sp: "sp-429-1", p: P("hp_spatk", { hp: 60, atk: 60, speed: 60 }) },
  { n: "音速犬", sp: "sp-48-1", p: P("jolly", { speed: 60, atk: 60, hp: 60 }) },
  { n: "朔夜伊芙", sp: "sp-87-1", p: P("modest", { spatk: 60, speed: 60, hp: 60 }) },
  { n: "皇家狮鹫", sp: "sp-167-1", p: P("jolly", { speed: 60, atk: 60, hp: 60 }) },
];
console.log("=== 我方面板（引擎，60级/5★/已定资质）===");
for (const o of OUR) {
  const s = spB(o.n);
  const st = computeStats(b.stats, s, o.p);
  console.log(`  ${o.n}: HP ${st.hp} 物攻 ${st.atk} 物防 ${st.defense} 魔攻 ${st.spatk} 魔防 ${st.spdef} 速度 ${st.speed}`);
}

// 反推：给【我方攻击手 + 技能 + 实录伤害】→ 敌方 def 缩放
function engineDmg(atkName: string, skill: string, defName: string) {
  const a = spB(atkName), d = spB(defName), s = skB(skill);
  const pa = makeActive(a.id, { hp: 9999, maxHp: 9999, energy: 10, profile: (OUR.find((o) => o.n === atkName)?.p) });
  pa.loadout = [s.id]; pa.element = a.elements;
  const de = makeActive(d.id, { hp: 9999, maxHp: 9999, energy: 10, profile: P(null, {}) });
  de.element = d.elements;
  const r = new Simulator(b).step(makeState(makeSide(pa), makeSide(de), { seed: 1 }), { kind: "skill", skillId: s.id }, { kind: "energy" }, new Rng(1));
  const ev = r.events.filter((e: any) => e.side === "enemy" && /damage/i.test(e.type)).map((e: any) => e.data);
  return { dmg: ev.map((x: any) => x.value), def: ev[0]?.breakdown?.dfn };
}
console.log("\n=== 反推敌方（我方攻击手资质已定）===");
const hits: [string, string, string, number, string][] = [
  ["音速犬", "火云车", "寂灭骨龙", 168, "2:36 抵抗"],
  ["音速犬", "跌落", "寂灭骨龙", 231, "2:49/5:37"],
  ["音速犬", "火云车", "月牙雪熊", 102, "（参考）"],
];
for (const [atk, skill, def, obs, note] of hits) {
  const e = engineDmg(atk, skill, def);
  const d0 = e.def, d1 = Math.round(d0 * e.dmg[0] / obs);
  console.log(`  ${atk}·${skill} → ${def}: 引擎(中性def${d0}) ${e.dmg[0]} 实录 ${obs} ${note} ⇒ 敌方 def ≈ ${d1}`);
}
