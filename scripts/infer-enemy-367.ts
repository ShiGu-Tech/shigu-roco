/** 敌方 6 只全推：我方资质已定，用实录命中反推敌方 def/atk → 映射性格。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState, computeStats } from "../apps/web/src/modules/engine";
const b: any = getBundle();
const spB = (n: string) => { const h = Object.values(b.sprites as any).find((s: any) => String(s.name).startsWith(n)); if (!h) throw new Error("缺 " + n); return h as any; };
const skB = (n: string) => { const h = Object.values(b.skills as any).find((s: any) => s.skillName === n); if (!h) throw new Error("缺技能 " + n); return h as any; };
const P = (nature: string | null, iv: Record<string, number>) => ({ level: 60, stars: 5, nature, iv } as any);
const OURS: Record<string, any> = {
  翠顶夫人: P("hp_spatk", { hp: 60, defense: 60, spdef: 60 }),
  深渊蛙: P("hp_spatk", { hp: 60, atk: 60, speed: 60 }),
  音速犬: P("jolly", { speed: 60, atk: 60, hp: 60 }),
  朔夜伊芙: P("modest", { spatk: 60, speed: 60, hp: 60 }),
  皇家狮鹫: P("jolly", { speed: 60, atk: 60, hp: 60 }),
};
function mkActive(name: string, prof: any, need?: string) {
  const s = spB(name); const a = makeActive(s.id, { hp: 9999, maxHp: 9999, energy: 10, profile: prof });
  const set = new Set<string>(s.skillList as string[]); if (need) set.add(skB(need).id);
  a.loadout = [...set]; a.element = s.elements; return a;
}
/** 我打敌：返回引擎伤害（中性敌） */
function weHit(ourName: string, skill: string, enemyName: string, buff = 1) {
  const pa = mkActive(ourName, OURS[ourName]); const de = mkActive(enemyName, P(null, {}));
  const r = new Simulator(b).step(makeState(makeSide(pa), makeSide(de), { seed: 1 }), { kind: "skill", skillId: skB(skill).id }, { kind: "energy" }, new Rng(1));
  const ev = r.events.filter((e: any) => e.side === "enemy" && /damage/i.test(e.type)).map((e: any) => e.data);
  return { dmg: ev.map((x: any) => x.value * buff), def: ev[0]?.breakdown?.dfn, type: ev[0]?.breakdown?.typeMult };
}
/** 敌打我：返回引擎伤害（中性敌） */
function enemyHit(enemyName: string, skill: string, ourName: string) {
  const pa = mkActive(ourName, OURS[ourName]); const de = mkActive(enemyName, P(null, {}));
  const r = new Simulator(b).step(makeState(makeSide(pa), makeSide(de), { seed: 1 }), { kind: "energy" }, { kind: "skill", skillId: skB(skill).id }, new Rng(1));
  const ev = r.events.filter((e: any) => e.side === "player" && /damage/i.test(e.type)).map((e: any) => e.data);
  return { dmg: ev.map((x: any) => x.value), atk: ev.find((x: any) => x.breakdown)?.breakdown?.atk };
}
console.log("=== 我打敌（反推敌方防御）===");
const A: [string, string, string, number, number, string][] = [
  ["深渊蛙", "斩断", "饮雪狂兽", 433, 2, "1:08 力量增效×2"],
  ["音速犬", "火云车", "寂灭骨龙", 168, 1, "2:36 抵抗"],
  ["音速犬", "跌落", "寂灭骨龙", 231, 1, "2:49/5:37"],
  ["翠顶夫人", "水刃", "雪影娃娃", -1, 1, "0:16 约15%"],
];
for (const [o, sk, e, obs, buff, note] of A) {
  const r = weHit(o, sk, e, buff);
  const base = r.def * r.dmg[0] / obs;
  console.log(`  ${o}·${sk} → ${e}: 引擎 ${r.dmg[0]}(中性防${r.def},克${r.type}) 实录 ${obs} ${note} ⇒ 敌防 ≈ ${Math.round(base)}`);
}
console.log("\n=== 敌打我（反推敌方攻击）===");
const B: [string, string, string, number, string][] = [
  ["雪影娃娃", "暴风雪", "翠顶夫人", 155, "0:18"],
  ["月牙雪熊", "先发制人", "深渊蛙", 20, "1:26"],
  ["寂灭骨龙", "先发制人", "音速犬", -1, "5:34/5:49 送走"],
];
for (const [e, sk, o, obs, note] of B) {
  const r = enemyHit(e, sk, o);
  const base = r.atk * obs / r.dmg[0];
  console.log(`  ${e}·${sk} → ${o}: 引擎 ${r.dmg[0]}(中性攻${r.atk}) 实录 ${obs} ${note} ⇒ 敌攻 ≈ ${Math.round(base)}`);
}
console.log("\n=== 敌方中性面板（作基准）===");

for (const n of ["雪影娃娃", "饮雪狂兽", "月牙雪熊", "寂灭骨龙", "卡瓦重", "伊兰亚龙"]) {
  const s = spB(n); const st = computeStats(b.stats, s, P(null, {}));
  console.log(`  ${n}: 物防 ${st.defense} 魔防 ${st.spdef} 物攻 ${st.atk} 魔攻 ${st.spatk} HP ${st.hp} 速 ${st.speed}`);
}

