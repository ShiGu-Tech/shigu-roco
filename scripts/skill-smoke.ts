/** 全技能冒烟：逐个技能在沙盒里跑一遍，报「抛错 / 无任何事件」。 */
import { getBundle } from "../apps/web/src/modules/engine/server";
import { Simulator, Rng, makeActive, makeSide, makeState } from "../apps/web/src/modules/engine";

const b = getBundle();
const sim = new Simulator(b);
const ids = Object.keys(b.skills).filter((id) => id.startsWith("sk-"));
const errors: string[] = [];
const empty: string[] = [];
let ok = 0;
for (const id of ids) {
  const atk = makeActive("sp-1-1", { hp: 500, maxHp: 500, energy: 10 });
  atk.loadout = [id];
  atk.element = ["Normal"];
  const def = makeActive("sp-1-1", { hp: 500, maxHp: 500, energy: 10 });
  def.element = ["Normal"];
  const st = makeState(makeSide(atk), makeSide(def), { seed: 1 });
  try {
    const r = sim.step(st, { kind: "skill", skillId: id }, { kind: "energy" }, new Rng(1));
    const interesting = r.events.filter((e) => !/energy|turn|weather-tick|faint|switch/i.test(e.type));
    if (interesting.length === 0) empty.push(`${b.skills[id].skillName}(${id})`);
    else ok++;
  } catch (e) {
    errors.push(`${b.skills[id].skillName}(${id}): ${(e as Error).message}`);
  }
}
console.log(`总技能 ${ids.length} | 有事件 ${ok} | 空 ${empty.length} | 抛错 ${errors.length}`);
console.log("\n=== 抛错 ==="); errors.forEach((x) => console.log("  " + x));
console.log("\n=== 无任何事件（可能有条件/纯被动，需人工看）==="); empty.forEach((x) => console.log("  " + x));
