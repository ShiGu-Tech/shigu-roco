// 第四期 · 复方汤剂 / 展翅（数据可直出部分）。
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

const replacePlaceholder = (name, full) => {
  const ph = mechs.find((m) => m.ownerType === "trait" && String(m.note ?? "").startsWith(`特性「${name}」`));
  if (ph) { Object.assign(ph, full); patched++; return; }
  let id = `trait:${byName.get(name)?.[0]}`;
  let n = 2;
  while (mechs.some((m) => m.id === id)) id = `trait:${byName.get(name)?.[0]}#${n++}`;
  mechs.push({ id, ...full }); added++;
};

// 复方汤剂：在场时双方回合末中毒额外触发 1 次。
const tonic = byName.get("复方汤剂");
if (tonic?.length) {
  replacePlaceholder("复方汤剂", {
    ownerType: "trait",
    ownerId: tonic[0],
    trigger: "turnEnd",
    when: [{ path: "self.active.spriteId", op: "in", value: tonic }, { path: "self.active.statuses.poison", op: "gte", value: 1 }],
    effects: [{ type: "dealDamage", target: "self", category: "Passive", power: 0, basis: "maxHp", amount: 0.03, element: "Poison" }],
    note: "特性「复方汤剂」：在场时双方中毒额外触发 1 次（自身）",
  });
  const id = `trait:${tonic[0]}#foe`;
  const full = {
    ownerType: "trait",
    ownerId: tonic[0],
    trigger: "turnEnd",
    when: [{ path: "self.active.spriteId", op: "in", value: tonic }, { path: "opponent.active.statuses.poison", op: "gte", value: 1 }],
    effects: [{ type: "dealDamage", target: "opponent", category: "Passive", power: 0, basis: "maxHp", amount: 0.03, element: "Poison" }],
    note: "特性「复方汤剂」：在场时双方中毒额外触发 1 次（敌方）",
  };
  const ph = mechs.find((m) => m.id === id);
  if (ph) { Object.assign(ph, full); patched++; } else { mechs.push({ id, ...full }); added++; }
}

// 展翅：后于敌方行动时，自己受到的伤害 +25%（普通→翼系 待实现）。
const spread = byName.get("展翅");
if (spread?.length) {
  replacePlaceholder("展翅", {
    ownerType: "trait",
    ownerId: spread[0],
    trigger: "beforeDamage",
    when: [{ path: "target.active.spriteId", op: "in", value: spread }, { path: "event.wentFirst", op: "eq", value: true }],
    effects: [
      { type: "modifyDamage", target: "self", mode: "add", value: 0.25, scope: "incoming" },
      { type: "unsupported", effectType: "elementChange", reason: "普通系技能变翼系 待实现【待校准】" },
    ],
    note: "特性「展翅」：后于敌方行动时受伤 +25%（普通→翼系待实现）",
  });
}

console.log(`patch ${patched}，add ${added}`);
if (!patched && !added) process.exit(0);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
