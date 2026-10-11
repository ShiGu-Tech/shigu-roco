/** 用「我打敌方的观测」反推敌方资质（走引擎 inferDefense/inferMaxHpRange/inferBuild）。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { DEFAULT_DAMAGE_BALANCE, PANEL_ORDER, inferBuild, inferDefense, inferMaxHpRange } from "../apps/web/src/modules/engine/calc";
import { typeMultiplier } from "../apps/web/src/modules/engine/data";

const bundle = getBundle();
const sprite = (n: string) => Object.values(bundle.sprites).find((s) => s.name === n)!;
const skill = (n: string) => Object.values(bundle.skills).find((s) => s.skillName === n)!;

/** 我方攻方面板（取自录屏面板）。 */
const OUR_PANEL: Record<string, { atk: number; spatk: number }> = {
  寂灭骨龙: { atk: 283, spatk: 109 },
  火羽: { atk: 124, spatk: 208 },
  水灵: { atk: 117, spatk: 233 },
};

interface Obs {
  enemy: string;
  by: string;
  skillName: string;
  damage: number;
  remainPct?: number;
  note: string;
}

const OBS: Obs[] = [
  { enemy: "恶魔红钻", by: "寂灭骨龙", skillName: "先发制人", damage: 156, remainPct: 61, note: "先发制人 156 → 敌 100→61%" },
  { enemy: "尖嘴狐仙", by: "寂灭骨龙", skillName: "隼鳞", damage: 196, note: "隼鳞 196/段（飘字）；目标随后阵亡" },
  { enemy: "锤头鹳", by: "火羽", skillName: "回旋风暴", damage: 157, note: "回旋风暴 157（飘字）" },
];

const elementsOf = (s: { elements?: unknown }) => (Array.isArray(s.elements) ? (s.elements as string[]) : []);

for (const o of OBS) {
  const en = sprite(o.enemy);
  const atkSprite = sprite(o.by);
  const sk = skill(o.skillName);
  const magical = sk.category === "Magic";
  const attackerAtk = OUR_PANEL[o.by][magical ? "spatk" : "atk"];
  const typeMult = typeMultiplier(bundle.elements, String(sk.element), elementsOf(en));
  const stab = elementsOf(atkSprite).includes(String(sk.element)) ? 1.25 : 1;
  const { defense, effectivePower } = inferDefense({ damage: o.damage, attackerAtk, power: Number(sk.power), typeMult, stab, balance: DEFAULT_DAMAGE_BALANCE });
  const hp = o.remainPct != null ? inferMaxHpRange(o.damage, o.remainPct) : undefined;

  console.log(`\n=== ${o.enemy} ← 我方 ${o.by} · ${o.skillName}（${magical ? "魔" : "物"} power=${sk.power} 系=${sk.element} typeMult=${typeMult.toFixed(2)} stab=${stab}）`);
  console.log(`  观测: ${o.note}`);
  console.log(`  有效威力 ${effectivePower.toFixed(1)} → 反推敌方防御区间 [${defense[0].toFixed(0)}, ${Number.isFinite(defense[1]) ? defense[1].toFixed(0) : "∞"}]`);
  if (hp) console.log(`  反推敌方 maxHp 区间 [${hp[0]}, ${Number.isFinite(hp[1]) ? hp[1] : "∞"}]`);

  const target: Record<string, [number, number]> = { defense: [defense[0], Number.isFinite(defense[1]) ? defense[1] : defense[0] * 3] };
  if (hp) target.hp = [hp[0], Number.isFinite(hp[1]) ? hp[1] : hp[0] * 1.5];
  // 先严格；无解则放宽
  let builds = inferBuild(en.race as never, target as never, { level: 60, stars: [5], stats: bundle.stats });
  let widened = 0;
  while (!builds.length && widened < 5) {
    widened++;
    const f = 1 + 0.15 * widened;
    const t = Object.fromEntries(Object.entries(target).map(([k, [lo, hi]]) => [k, [lo / f, hi * f]]));
    builds = inferBuild(en.race as never, t as never, { level: 60, stars: [5], stats: bundle.stats });
  }
  const constrained = PANEL_ORDER.filter((k) => target[k]);
  const rec = builds.filter(
    (b) => constrained.filter((k) => (b.talent[k] ?? 0) > 0).length <= 3 && constrained.every((k) => { const t = b.talent[k] ?? 0; return t === 0 || t === 10; }),
  );
  const pool = rec.length ? rec : builds;
  console.log(`  候选 build：${builds.length}（推荐加点 ${rec.length}）${widened ? ` · 放宽×${widened}` : ""}`);
  const seen = new Set<string>();
  let shown = 0;
  for (const b of pool) {
    const key = `${b.nature.up ?? "-"}${b.nature.down ?? "-"}|${constrained.map((k) => b.talent[k] ?? 0).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tal = constrained.map((k) => `${k}:${b.talent[k] ?? 0}`).join(" ");
    console.log(`    ${b.nature.up ?? "无"}↑/${b.nature.down ?? "无"}↓  ${tal}  → 面板 防${b.panel.defense} 血${b.panel.hp}`);
    if (++shown >= 6) break;
  }
}
