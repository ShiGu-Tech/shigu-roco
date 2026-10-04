// 第四期 · 长尾修订：狂欢开始落地「背包随机精灵 + 限换」（新原语 summonRandom）；秋收暂缓（草地环境待数据）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const traitIds = (name) => catalog.sprites.filter((s) => s.trait?.name === name).map((s) => s.id);

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;

const CARNIVAL = "狂欢开始";
const HARVEST = "秋收";
const IN = (note, name) => String(note ?? "").startsWith(`特性「${name}」`);

// 清理本批与上一批相关条目。
for (let i = mechs.length - 1; i >= 0; i--) {
  const m = mechs[i];
  const note = String(m.note ?? "");
  if (IN(note, CARNIVAL)) mechs.splice(i, 1);
  if (IN(note, HARVEST)) mechs.splice(i, 1);
  if (m.id?.endsWith("#c56")) mechs.splice(i, 1);
}

const added = [];
const inList = (ids) => ({ path: "self.active.spriteId", op: "in", value: ids });

// 狂欢开始：受克伤 +25%（被动）+ 入场随机召唤精灵（只能与召唤者互换）。
{
  const s = traitIds(CARNIVAL);
  if (s.length) {
    added.push({ id: `trait:${s[0]}#c56`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [inList(s)], effects: [{ type: "setRuleModifier", target: "self", key: "damage.superEffectiveTaken", value: 0.25 }], note: "特性「狂欢开始」：受到的克制伤害 +25%" });
    added.push({ id: `trait:${s[0]}#c56-summon`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [inList(s)], effects: [{ type: "summonRandom", target: "self", count: 1 }], note: "特性「狂欢开始」：在场时背包变化出 1 只随机精灵（只能与本精灵互换，【待校准】数量）" });
  }
}

// 秋收：暂缓（需「草地环境」数据）。
{
  const s = traitIds(HARVEST);
  if (s.length) added.push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [], effects: [{ type: "unsupported", effectType: "fieldEnvironment", reason: "秋收：草地环境时机械系技能威力 +50%【待校准：草地环境数据缺失，暂缓】" }], note: "特性「秋收」：待实现（草地环境）" });
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) {
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`);
} else console.log("dry-run");
