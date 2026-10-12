/** 攻击技能冒烟：攻击技（物/魔，威力>0 或作者含 dealDamage）是否真打出伤害。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";

const b = getBundle();
const sim = new Simulator(b);
const authoredDamage = new Set(
  (b.mechanisms ?? []).filter((m) => (m as Record<string, unknown>).ownerType === "skill" && JSON.stringify((m as Record<string, unknown>).effects ?? []).includes("dealDamage")).map((m) => String((m as Record<string, unknown>).ownerId)),
);
const ids = Object.keys(b.skills).filter((id) => id.startsWith("sk-"));
const flagged: string[] = [];
for (const id of ids) {
  const s = b.skills[id] as Record<string, unknown>;
  if (s.category === "Defense") continue; // 防御技不直接造成伤害（正常）
  const isAtk = (s.category === "Physical" || s.category === "Magic") && Number(s.power ?? 0) > 0;
  if (!isAtk && !authoredDamage.has(id)) continue;
  const atk = makeActive("sp-1-1", { hp: 500, maxHp: 500, energy: 10 });
  atk.loadout = [id]; atk.element = ["Normal"];
  const def = makeActive("sp-1-1", { hp: 500, maxHp: 500, energy: 10 }); def.element = ["Normal"];
  try {
    // 跑 2 回合：蓄力技在第 2 回合释放时才有伤害。
    let state = makeState(makeSide(atk), makeSide(def), { seed: 1 });
    let dealt = false;
    for (let turn = 1; turn <= 2; turn++) {
      const r = sim.step(state, { kind: "skill", skillId: id }, { kind: "energy" }, new Rng(1));
      state = r.state;
      if (r.events.some((e) => e.side === "enemy" && /damage/i.test(e.type) && Number((e.data as Record<string, unknown>).value ?? 0) > 0)) dealt = true;
    }
    if (!dealt) flagged.push(`${s.skillName}(${id}) cat=${s.category} power=${s.power} — 攻击技但未造成伤害`);
  } catch (e) {
    flagged.push(`${s.skillName}(${id}) 抛错: ${(e as Error).message}`);
  }
}
console.log(`攻击技共 ${ids.length} 技能表；命中但 0 伤 / 抛错：${flagged.length}`);
flagged.forEach((x) => console.log("  ❌ " + x));
