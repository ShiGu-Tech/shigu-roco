// 第四期 · 回合对比族：石天平（能耗差扣能量）/ 合拍（同项永久加成）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const n = sp.trait?.name;
  if (!n) continue;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(sp.id);
}

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
let patched = 0, added = 0;
const upsert = (name, key, note) => {
  const ids = byName.get(name);
  if (!ids?.length) { console.log("  ! 未找到特性:", name); return; }
  const full = { ownerType: "trait", ownerId: ids[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: ids }], effects: [{ type: "setRuleModifier", target: "self", key, value: true }], note: `特性「${name}」：${note}` };
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `trait:${ids[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${ids[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

upsert("石天平", "drainCostDiff", "使用技能能耗高于敌方时，回合结束敌方失去能耗之差的能量");
upsert("合拍", "harmony", "本回合与敌方技能在系别 / 类型 / 能耗上每相同 1 项，物攻与物防永久 +10%");

// 夺目：非光系技能威力 +25%（额外随机技能待实现）。
{
  const ids = byName.get("夺目");
  if (ids?.length) {
    const full = {
      ownerType: "trait",
      ownerId: ids[0],
      trigger: "passive",
      when: [{ path: "self.active.spriteId", op: "in", value: ids }],
      effects: [
        { type: "setRuleModifier", target: "self", key: "power.nonLight", value: 0.25 },
        { type: "unsupported", effectType: "extraRandomSkills", reason: "额外获得三个未携带随机技能 待实现【待校准】" },
      ],
      note: "特性「夺目」：非光系技能威力 +25%（额外随机技能待实现）",
    };
    const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith("特性「夺目」"));
    if (ph) { Object.assign(ph, full); patched++; } else { mechs.push({ id: `trait:${ids[0]}`, ...full }); added++; }
  }
}

console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
