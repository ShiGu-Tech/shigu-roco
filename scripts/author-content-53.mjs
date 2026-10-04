// 第四期 · 选择计数族：猫精灵的礼物（每完整用一次选择技，入场物攻 +40%）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byTrait = new Map();
for (const sp of catalog.sprites) {
  const n = sp.trait?.name;
  if (!n) continue;
  if (!byTrait.has(n)) byTrait.set(n, []);
  byTrait.get(n).push(sp.id);
}
const ids = (name) => byTrait.get(name) ?? [];

const traitNames = ["猫精灵的礼物"];
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (mechs[i].ownerType === "trait" && traitNames.some((n) => String(mechs[i].note ?? "").startsWith(`特性「${n}」`))) mechs.splice(i, 1);
}

const added = [];
for (const name of traitNames) {
  const s = ids(name);
  if (!s.length) continue;
  added.push({ id: `trait:${s[0]}`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }, { not: { path: "self.active.counters.giftApplied", op: "gte", value: 1 } }], effects: [
    { type: "setCounter", target: "self", key: "giftApplied", valueFrom: { path: "self.counters.choiceFull" } },
    { type: "modifyStat", target: "self", stat: "atk", mode: "percent", value: 0, valueFrom: { path: "self.counters.choiceFull", scale: 40 } },
  ], note: `特性「${name}」：己方每完整使用 1 次选择技（明+暗），自己入场时物攻 +40%` });
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
