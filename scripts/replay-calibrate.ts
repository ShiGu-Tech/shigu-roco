/** 闭合循环：把敌方观测（攻/防/血）汇总 → 引擎校正 → inferBuild 反推敌方资质。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import {
  Simulator, Rng, computeStats, inferBuild, inferDefense, inferMaxHpRange,
  makeActive, makeSide, makeState,
} from "../apps/web/src/modules/engine";
import { typeMultiplier } from "../apps/web/src/modules/engine/data";
import { PANEL_ORDER } from "../apps/web/src/modules/engine/calc";

const bundle = getBundle();
const sprite = (n: string) => Object.values(bundle.sprites).find((s) => s.name === n)!;
const skill = (n: string) => Object.values(bundle.skills).find((s) => s.skillName === n)!;
const L = 60, STARS = 5;
type SP = { level: number; stars: number; nature: string | null; iv: Record<string, number> };
const neutral: SP = { level: L, stars: STARS, nature: null, iv: {} };

/** 由观测面板反解我方养成档案（含性格）。 */
const OUR_PANELS: Record<string, Record<string, number>> = {
  水灵: { hp: 501, defense: 163, atk: 117, spdef: 238, spatk: 233, speed: 154 },
  火羽: { hp: 354, defense: 127, atk: 124, spdef: 177, spatk: 208, speed: 225 },
  寂灭骨龙: { hp: 425, defense: 207, atk: 283, spdef: 149, spatk: 109, speed: 126 },
};
function natureId(up: string | null, down: string | null): string | null {
  return (bundle.stats.natures ?? []).find((n) => (n.up ?? null) === up && (n.down ?? null) === down)?.id ?? null;
}
function fitOur(name: string): SP {
  const panel = OUR_PANELS[name];
  const s = sprite(name);
  const target: Record<string, [number, number]> = {};
  for (const k of PANEL_ORDER) target[k] = [panel[k], panel[k]];
  const bs = inferBuild(s.race as never, target as never, { level: L, stars: [STARS], stats: bundle.stats });
  const c = bs[0] as { nature: { up: string | null; down: string | null }; iv: Record<string, number> } | undefined;
  if (!c) return { level: L, stars: STARS, nature: null, iv: {} };
  console.log(`  fit ${name}: nature=${c.nature.up ?? "-"}↑/${c.nature.down ?? "-"}↓ iv=${JSON.stringify(c.iv)}`);
  return { level: L, stars: STARS, nature: natureId(c.nature.up, c.nature.down), iv: c.iv };
}
const OUR: Record<string, SP> = { 水灵: fitOur("水灵"), 火羽: fitOur("火羽"), 寂灭骨龙: fitOur("寂灭骨龙") };

function active(name: string, profile: SP, hp: number, buffs: Record<string, number> = {}) {
  const s = sprite(name);
  const a = makeActive(s.id as string, { hp, maxHp: hp, energy: 10, profile: profile as never });
  a.element = Array.isArray(s.elements) ? (s.elements as string[]) : [];
  a.buffs = { ...buffs };
  return a;
}
function toAction(name: string, choice?: 0 | 1) {
  return name === "聚能" ? { kind: "energy" as const } : { kind: "skill" as const, skillId: skill(name).id as string, ...(choice === undefined ? {} : { choice }) };
}
function runDamage(ourName: string, enemyName: string, ourAction: string, enemyAction: string, ourBuffs: Record<string, number>, enemyBuffs: Record<string, number> = {}, enemyChoice?: 0 | 1) {
  const p = makeSide(active(ourName, OUR[ourName], 9999, ourBuffs));
  const e = makeSide(active(enemyName, neutral, 9999, enemyBuffs));
  const sim = new Simulator(bundle);
  const r = sim.step(makeState(p, e, { seed: 1 }), toAction(ourAction), toAction(enemyAction, enemyChoice), new Rng(1));
  return (side: "player" | "enemy") => r.events.filter((ev) => ev.side === side && /damage/i.test(ev.type)).reduce((s, ev) => s + Number((ev.data as Record<string, unknown>).value ?? 0), 0);
}

interface Obs {
  enemy: string; dir: "atk" | "def"; by: string; skillName: string;
  ourAction: string; enemyAction: string; damage: number; remainPct?: number; ourBuffs?: Record<string, number>; enemyBuffs?: Record<string, number>; enemyChoice?: 0 | 1;
}
const OBS: Obs[] = [
  { enemy: "铠甲虫", dir: "atk", by: "水灵", skillName: "虫群过境", ourAction: "水泡盾", enemyAction: "虫群过境", damage: 16 },
  { enemy: "锤头鹳", dir: "atk", by: "火羽", skillName: "潮涌", ourAction: "聚能", enemyAction: "潮涌", damage: 289 },
  { enemy: "恶魔红钻", dir: "atk", by: "寂灭骨龙", skillName: "下注", ourAction: "报复", enemyAction: "下注", damage: 145, enemyBuffs: { atk: 1.0 }, enemyChoice: 1 }, // 恶魔红钻开过力量增效; 下注走"暗"分支
  { enemy: "花衣蝶", dir: "atk", by: "火羽", skillName: "飞断", ourAction: "聚能", enemyAction: "飞断", damage: 8 },
  { enemy: "恶魔红钻", dir: "def", by: "寂灭骨龙", skillName: "先发制人", ourAction: "先发制人", enemyAction: "聚能", damage: 156, remainPct: 61, ourBuffs: { atk: 1.0 } },
  { enemy: "尖嘴狐仙", dir: "def", by: "寂灭骨龙", skillName: "隼鳞", ourAction: "隼鳞", enemyAction: "聚能", damage: 588, ourBuffs: { atk: 1.0 } }, // 隼鳞一次性(数字慢跳，终值588)；骨龙带力量增效
  { enemy: "锤头鹳", dir: "def", by: "火羽", skillName: "回旋风暴", ourAction: "回旋风暴", enemyAction: "聚能", damage: 157 },
];

const byEnemy = new Map<string, Obs[]>();
for (const o of OBS) (byEnemy.get(o.enemy) ?? byEnemy.set(o.enemy, []).get(o.enemy)!).push(o);

for (const [enemyName, list] of byEnemy) {
  const en = sprite(enemyName);
  const neutralPanel = computeStats(bundle.stats, en, neutral);
  const targets: Record<string, [number, number]> = {};
  console.log(`\n================ ${enemyName}（中性 防${neutralPanel.defense} 攻${neutralPanel.atk} 血${neutralPanel.hp}）`);
  for (const o of list) {
    const dmgOf = runDamage(o.by, enemyName, o.ourAction, o.enemyAction, o.ourBuffs ?? {}, o.enemyBuffs ?? {}, o.enemyChoice);
    const sk = skill(o.skillName);
    if (o.dir === "atk") {
      const engineDmg = dmgOf("player");
      const ratio = engineDmg > 0 ? o.damage / engineDmg : 1;
      const targetAtk = neutralPanel[sk.category === "Magic" ? "spatk" : "atk"] * ratio;
      const key = sk.category === "Magic" ? "spatk" : "atk";
      const r: [number, number] = [targetAtk * 0.94, targetAtk * 1.06];
      targets[key] = targets[key] ? [Math.max(targets[key][0], r[0]), Math.min(targets[key][1], r[1])] : r;
      console.log(`  [攻] ${o.skillName}→${o.by}: 引擎${engineDmg} 实测${o.damage} (×${ratio.toFixed(2)}) → ${key}∈[${r[0].toFixed(0)},${r[1].toFixed(0)}]`);
    } else {
      const engineDmg = dmgOf("enemy");
      const ratio = o.damage > 0 ? engineDmg / o.damage : 1;
      const key = sk.category === "Magic" ? "spdef" : "defense";
      const targetDef = neutralPanel[key] * ratio;
      const r: [number, number] = [targetDef * 0.94, targetDef * 1.06];
      targets[key] = targets[key] ? [Math.max(targets[key][0], r[0]), Math.min(targets[key][1], r[1])] : r;
      console.log(`  [防] ${o.by}·${o.skillName}→: 引擎${engineDmg} 实测${o.damage} (×${ratio.toFixed(2)}) → ${key}∈[${r[0].toFixed(0)},${r[1].toFixed(0)}]`);
      if (o.remainPct != null) {
        const hp = inferMaxHpRange(o.damage, o.remainPct);
        targets.hp = targets.hp ? [Math.max(targets.hp[0], hp[0]), Math.min(targets.hp[1], hp[1])] : hp;
        console.log(`  [血] remain ${o.remainPct}% → maxHp∈[${hp[0]},${hp[1]}]`);
      }
    }
  }
  const valid = Object.fromEntries(Object.entries(targets).filter(([, [lo, hi]]) => lo <= hi));
  if (!Object.keys(valid).length) { console.log("  （区间互斥，无解）"); continue; }
  let builds = inferBuild(en.race as never, valid as never, { level: L, stars: [STARS], stats: bundle.stats });
  if (!builds.length) { console.log("  （该区间 5★60 不可达）"); continue; }
  const seen = new Set<string>();
  let n = 0;
  console.log(`  候选 ${builds.length}，最前：`);
  for (const b of builds) {
    const key = `${b.nature.up ?? "-"}${b.nature.down ?? "-"}|${Object.keys(valid).map((k) => (b.talent as Record<string, number>)[k] ?? 0).join(",")}`;
    if (seen.has(key)) continue; seen.add(key);
    console.log(`    ${b.nature.up ?? "无"}↑/${b.nature.down ?? "无"}↓  ${Object.keys(valid).map((k) => `${k}:${(b.talent as Record<string, number>)[k] ?? 0}`).join(" ")} → 面板 ${JSON.stringify(b.panel)}`);
    if (++n >= 6) break;
  }
}

