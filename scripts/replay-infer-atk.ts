/** 由 T1 观测反推敌方「攻」→ 资质（走引擎：先在已知配置下跑出引擎伤害，再按比例校正）。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, computeStats, inferBuild, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";

const bundle = getBundle();
const sprite = (n: string) => Object.values(bundle.sprites).find((s) => s.name === n)!;
const skill = (n: string) => Object.values(bundle.skills).find((s) => s.skillName === n)!;

const L = 60, STARS = 5;
const neutral = { level: L, stars: STARS, nature: null as string | null, iv: {} as Record<string, number> };
const shuiling = { level: L, stars: STARS, nature: null as string | null, iv: { hp: 60, spatk: 60, spdef: 60 } };

function active(name: string, profile: typeof neutral, hp: number) {
  const s = sprite(name);
  const a = makeActive(s.id as string, { hp, maxHp: hp, energy: 10, profile: profile as never });
  a.element = Array.isArray(s.elements) ? (s.elements as string[]) : [];
  return a;
}

// —— 已知：我方 水灵；未知：敌方 铠甲虫（中性）。跑引擎得"引擎伤害"。 ——
const p = makeSide(active("水灵", shuiling, 501));
const e = makeSide(active("铠甲虫", neutral, 9999));
const sim = new Simulator(bundle);
const r = sim.step(makeState(p, e, { seed: 1 }), { kind: "skill", skillId: skill("水泡盾").id as string }, { kind: "skill", skillId: skill("虫群过境").id as string }, new Rng(1));
const engineDamage = r.events.filter((ev) => ev.side === "player" && /damage/i.test(ev.type)).reduce((s, ev) => s + Number((ev.data as Record<string, unknown>).value ?? 0), 0);

const OBS = 16;
const race = sprite("铠甲虫").race as Record<string, number>;
const neutralAtk = computeStats(bundle.stats, sprite("铠甲虫"), neutral).atk;
const targetAtk = neutralAtk * (OBS / Math.max(1, engineDamage));

console.log(`引擎伤害(中性铠甲虫) = ${engineDamage}；实测 = ${OBS}`);
console.log(`铠甲虫 中性物攻 = ${neutralAtk} → 校正目标物攻 ≈ ${targetAtk.toFixed(1)}（×${(OBS / engineDamage).toFixed(2)}）`);

const lo = targetAtk * 0.94, hi = targetAtk * 1.06;
const builds = inferBuild(race as never, { atk: [lo, hi] } as never, { level: L, stars: [STARS], stats: bundle.stats });
console.log(`反推候选（物攻 ∈ [${lo.toFixed(0)}, ${hi.toFixed(0)}]）：${builds.length} 个`);
const seen = new Set<string>();
let n = 0;
for (const b of builds) {
  const key = `${b.nature.up ?? "-"}/${b.nature.down ?? "-"}|${b.talent.atk ?? 0}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${b.nature.up ?? "无"}↑/${b.nature.down ?? "无"}↓  天分atk=${b.talent.atk ?? 0}  → 面板物攻 ${b.panel.atk}`);
  if (++n >= 8) break;
}
