// 第四期 · 长尾修订 2：狂欢开始召唤 3 只；棱镜球半量取整（整数语义字段向下取半，避免 0.5 层 / 0.5 能量）。
import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
const added = [];

// 狂欢开始：召唤 3 只。
const summon = mechs.find((m) => m.id === "trait:sp-348-1#c56-summon");
if (summon) {
  summon.effects = [{ type: "summonRandom", target: "self", count: 3 }];
  summon.note = "特性「狂欢开始」：在场时背包变化出 3 只随机精灵（只能与本精灵互换）";
}

// 棱镜球半量：整数语义字段取半（Math.trunc），连续值（pct / 生命比例）保留精确半值。
const halfRule = (v) => (Number.isInteger(v) ? Math.trunc(v / 2) : v / 2);
let rebuilt = 0;
for (const m of mechs) {
  if (!String(m.id ?? "").endsWith("#half")) continue;
  const full = mechs.find((x) => x.id === String(m.id).slice(0, -"#half".length));
  if (!full) continue;
  m.effects = (full.effects ?? []).map((effect) => {
    const out = { ...effect };
    for (const key of ["delta", "amount", "layers", "value"]) {
      if (typeof out[key] === "number") out[key] = halfRule(out[key]);
    }
    return out;
  });
  rebuilt += 1;
}
console.log(`summon: ${summon ? "ok" : "missing"}; half rebuilt: ${rebuilt}`);
mechs.push(...added);

const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) {
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`);
} else console.log("dry-run");
