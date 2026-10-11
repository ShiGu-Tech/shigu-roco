/** 只测视频里用到的技能：逐个沙盒跑，报伤害/事件/异常。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";

const b = getBundle();
const sim = new Simulator(b);
const names = "双联脉冲 突击 飞羽 潮涌 雷暴 怒火 闪燃 吹火 光合作用 光能聚集 焚烧烙印 移花接木 水弹枪 高温回火 水泡盾 泡沫幻影 坟场搏击 孢子 龙卷风 水炮 水刃 暴风雪 力量增效 冬至 斩断 先发制人 防御 火云车 跌落 跺地 羽化加速 啄击 报复".split(/\s+/);
for (const nm of names) {
  const hit = Object.values(b.skills).find((s) => s.skillName === nm);
  if (!hit) { console.log(`  ❌ 未找到技能: ${nm}`); continue; }
  const id = String(hit.id);
  const atk = makeActive("sp-1-1", { hp: 500, maxHp: 500, energy: 10 }); atk.loadout = [id]; atk.element = ["Normal"];
  const def = makeActive("sp-1-1", { hp: 500, maxHp: 500, energy: 10 }); def.element = ["Normal"];
  try {
    const r = sim.step(makeState(makeSide(atk), makeSide(def), { seed: 1 }), { kind: "skill", skillId: id }, { kind: "energy" }, new Rng(1));
    const dmg = r.events.filter((e) => /damage/i.test(e.type)).reduce((s, e) => s + Number((e.data as Record<string, unknown>).value ?? 0), 0);
    const types = [...new Set(r.events.map((e) => e.type))].join(",");
    const isAtk = (hit.category === "Physical" || hit.category === "Magic") && Number(hit.power ?? 0) > 0 && Number(hit.power ?? 0) < 100000;
    const flag = isAtk && dmg === 0 ? "  ⚠攻击技0伤" : "";
    console.log(`  ${nm.padEnd(6)} ${id} cat=${hit.category} pow=${hit.power} → 伤害=${dmg} 事件[${types}]${flag}`);
  } catch (e) {
    console.log(`  ${nm} 抛错: ${(e as Error).message}`);
  }
}
