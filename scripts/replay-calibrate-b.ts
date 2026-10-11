/** 视频 B 观测反推：用我方精确 HP 差反推敌方「攻」。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, computeStats, inferBuild, makeActive, makeSide, makeState, PANEL_ORDER } from "../apps/web/src/modules/engine";

const bundle = getBundle();
const sprite = (n: string) => Object.values(bundle.sprites).find((s) => s.name === n || s.nameZh === n || String(s.name ?? "").startsWith(n))!;
const skill = (n: string) => Object.values(bundle.skills).find((s) => s.skillName === n)!;
const L = 60, STARS = 5;
type SP = { level: number; stars: number; nature: string | null; iv: Record<string, number> };
const neutral: SP = { level: L, stars: STARS, nature: null, iv: {} };
const OUR_PANELS: Record<string, Record<string, number>> = {
  "圣剑-X": { hp: 517, defense: 283, atk: 291, spdef: 250, spatk: 197, speed: 132 },
  伊兰亚龙: { hp: 411, defense: 136, atk: 160, spdef: 157, spatk: 302, speed: 220 },
  尖嘴狐仙: { hp: 480, defense: 185, atk: 156, spdef: 211, spatk: 156, speed: 158 },
};
const natureId = (up: string | null, down: string | null) => (bundle.stats.natures ?? []).find((n) => (n.up ?? null) === up && (n.down ?? null) === down)?.id ?? null;
function fitOur(name: string): SP {
  const panel = OUR_PANELS[name]; const s = sprite(name);
  const t: Record<string, [number, number]> = {}; for (const k of PANEL_ORDER) t[k] = [panel[k], panel[k]];
  const c = (inferBuild(s.race as never, t as never, { level: L, stars: [STARS], stats: bundle.stats })[0]) as { nature: { up: string | null; down: string | null }; iv: Record<string, number> } | undefined;
  if (!c) { console.log(`  fit ${name}: 无解→中性`); return neutral; }
  console.log(`  fit ${name}: ${c.nature.up ?? "-"}↑/${c.nature.down ?? "-"}↓`);
  return { level: L, stars: STARS, nature: natureId(c.nature.up, c.nature.down), iv: c.iv };
}
const OUR: Record<string, SP> = { "圣剑-X": fitOur("圣剑-X"), 伊兰亚龙: fitOur("伊兰亚龙"), 尖嘴狐仙: fitOur("尖嘴狐仙") };

function active(name: string, profile: SP, hp: number, buffs: Record<string, number> = {}) {
  const s = sprite(name); const a = makeActive(s.id as string, { hp, maxHp: hp, energy: 10, profile: profile as never });
  a.element = Array.isArray(s.elements) ? (s.elements as string[]) : []; a.buffs = { ...buffs }; return a;
}
const toAction = (n: string) => (n === "聚能" ? { kind: "energy" as const } : { kind: "skill" as const, skillId: skill(n).id as string });
function engineDmg(ourName: string, enemyName: string, ourAction: string, enemyAction: string) {
  const p = makeSide(active(ourName, OUR[ourName], 9999));
  const e = makeSide(active(enemyName, neutral, 9999));
  const r = new Simulator(bundle).step(makeState(p, e, { seed: 1 }), toAction(ourAction), toAction(enemyAction), new Rng(1));
  return r.events.filter((ev) => ev.side === "player" && /damage/i.test(ev.type)).reduce((s, ev) => s + Number((ev.data as Record<string, unknown>).value ?? 0), 0);
}
interface Obs { enemy: string; by: string; skillName: string; ourAction: string; enemyAction: string; damage: number }
const OBS: Obs[] = [
  { enemy: "椰浆布丁", by: "圣剑-X", skillName: "天洪", ourAction: "聚能", enemyAction: "天洪", damage: 258 },
  { enemy: "伊贝粉粉", by: "圣剑-X", skillName: "藤绞", ourAction: "聚能", enemyAction: "藤绞", damage: 23 },
  { enemy: "罗隐", by: "伊兰亚龙", skillName: "彼岸之手", ourAction: "聚能", enemyAction: "彼岸之手", damage: 388 },
  { enemy: "岚鸟", by: "尖嘴狐仙", skillName: "龙卷风", ourAction: "焚烧烙印", enemyAction: "龙卷风", damage: 224 },
];
const byEnemy = new Map<string, Obs[]>();
for (const o of OBS) (byEnemy.get(o.enemy) ?? byEnemy.set(o.enemy, []).get(o.enemy)!).push(o);

for (const [enemyName, list] of byEnemy) {
  const en = sprite(enemyName);
  const np = computeStats(bundle.stats, en, neutral);
  const targets: Record<string, [number, number]> = {};
  console.log(`\n=== ${enemyName}（中性 攻${np.atk} 魔攻${np.spatk}）`);
  for (const o of list) {
    const ed = engineDmg(o.by, enemyName, o.ourAction, o.enemyAction);
    const sk = skill(o.skillName);
    const key = sk.category === "Magic" ? "spatk" : "atk";
    const ratio = ed > 0 ? o.damage / ed : 1;
    const tAtk = np[key] * ratio;
    const r: [number, number] = [tAtk * 0.94, tAtk * 1.06];
    targets[key] = targets[key] ? [Math.max(targets[key][0], r[0]), Math.min(targets[key][1], r[1])] : r;
    console.log(`  ${o.skillName}→${o.by}: 引擎${ed} 实测${o.damage} (×${ratio.toFixed(2)}) → ${key}∈[${r[0].toFixed(0)},${r[1].toFixed(0)}]`);
  }
  const valid = Object.fromEntries(Object.entries(targets).filter(([, [lo, hi]]) => lo <= hi));
  if (!Object.keys(valid).length) { console.log("  （互斥）"); continue; }
  const bs = inferBuild(en.race as never, valid as never, { level: L, stars: [STARS], stats: bundle.stats });
  if (!bs.length) { console.log("  （5★60 不可达）"); continue; }
  console.log(`  候选 ${bs.length}：`);
  const seen = new Set<string>(); let n = 0;
  for (const b of bs) {
    const key = `${b.nature.up ?? "-"}${b.nature.down ?? "-"}|${Object.keys(valid).map((k) => (b.talent as Record<string, number>)[k] ?? 0).join(",")}`;
    if (seen.has(key)) continue; seen.add(key);
    console.log(`    ${b.nature.up ?? "无"}↑/${b.nature.down ?? "无"}↓ ${Object.keys(valid).map((k) => `${k}:${(b.talent as Record<string, number>)[k] ?? 0}`).join(" ")} → 面板 ${JSON.stringify(b.panel)}`);
    if (++n >= 5) break;
  }
}
