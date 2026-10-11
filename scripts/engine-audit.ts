/** 一次性：引擎现状体检（警告 / 未支持效果 / 覆盖缺口）。 */
import { getBundle } from "../apps/web/src/modules/engine/server";

const bundle = getBundle();

console.log("== warnings ==", bundle.warnings.length);
bundle.warnings.slice(0, 40).forEach((w) => console.log("  -", w));

type Dict = Record<string, unknown>;
const mechs = (bundle.mechanisms ?? []) as Dict[];

function findUnsupported(effects: unknown, acc: string[]): void {
  if (!Array.isArray(effects)) return;
  for (const e of effects as Dict[]) {
    if (!e || typeof e !== "object") continue;
    if (e.type === "unsupported") acc.push(String(e.effectType ?? "?"));
    for (const f of ["effects", "effectsPerLayer", "effectsOnConsume"]) findUnsupported(e[f], acc);
  }
}

const unsupportedMechs: { id: string; owner: string; types: string[] }[] = [];
for (const m of mechs) {
  const acc: string[] = [];
  findUnsupported(m.effects, acc);
  if (acc.length) {
    const owner = `${String(m.ownerType)}:${String(m.ownerId)}`;
    unsupportedMechs.push({ id: String(m.id), owner, types: [...new Set(acc)] });
  }
}
console.log("\n== mechanisms ==", mechs.length, "| 含 unsupported 的机制:", unsupportedMechs.length);
const byType: Record<string, number> = {};
for (const u of unsupportedMechs) for (const t of u.types) byType[t] = (byType[t] ?? 0) + 1;
console.log("未支持效果类型分布:", byType);
console.log("\n样例（前 60）:");
unsupportedMechs.slice(0, 60).forEach((u) => console.log(`  ${u.owner}  ${u.id}  <- ${u.types.join(",")}`));

// 特性的 unsupported 参数
const traitsUnsup = Object.values(bundle.sprites).filter((s) => (s.trait as Dict)?.params && ((s.trait as Dict).params as Dict).unsupported === true);
console.log("\n== 特性 params.unsupported ==", traitsUnsup.length, "（样例）", traitsUnsup.slice(0, 20).map((s) => s.name));

// 技能覆盖：物理/魔法且 power>0
const sk = Object.values(bundle.skills);
const dmgSkills = sk.filter((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power ?? 0) > 0);
console.log("\n== skills ==", sk.length, "| 物理/魔法威力>0:", dmgSkills.length);
const sentinel = dmgSkills.filter((s) => Number(s.power) >= 100000);
console.log("威力哨兵(变量威力):", sentinel.length, sentinel.slice(0, 20).map((s) => `${s.skillName}=${s.power}`));

// 哨兵技能是否有作者机制（否则会被跳过自动伤害 → 打 0）
const authoredSkill = new Set(mechs.filter((m) => m.ownerType === "skill").map((m) => String(m.ownerId)));
console.log("哨兵技能是否有作者机制:", sentinel.map((s) => `${s.id}:${authoredSkill.has(String(s.id))}`));

// ownerType 分布
const byOwner: Record<string, number> = {};
for (const m of mechs) byOwner[String(m.ownerType)] = (byOwner[String(m.ownerType)] ?? 0) + 1;
console.log("机制 ownerType 分布:", byOwner);

// statuses / marks / weather 计数
console.log("statuses", Object.keys(bundle.statuses).length, "marks", Object.keys(bundle.marks).length, "weather", Object.keys(bundle.weather).length);

