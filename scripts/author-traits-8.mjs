import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");
const API = process.env.ROCK_API ?? "http://localhost:26900";

const catalog = await (await fetch(`${API}/api/engine/catalog`)).json();
const byName = new Map();
for (const sp of catalog.sprites) {
  const name = sp.trait?.name;
  if (!name) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(sp.id);
}
const SELF = (name) => ({ path: "self.active.spriteId", op: "in", value: byName.get(name) ?? [] });
const ENTER = (name) => ({ path: "event.enteredSpriteId", op: "in", value: byName.get(name) ?? [] });

const traits = [
  { name: "诈死", trigger: "afterDeath", when: [SELF("诈死")], effects: [{ type: "modifyMagic", target: "self", delta: 1 }], note: "力竭少损失 1 魔力" },
  { name: "御驾亲征", trigger: "afterDeath", when: [SELF("御驾亲征")], effects: [{ type: "modifyMagic", target: "self", delta: -4 }], note: "力竭额外扣 4 魔力（资质提升待校准）" },
  { name: "友情之果", trigger: "turnEnd", when: [SELF("友情之果")], effects: [{ type: "modifyEnergy", target: "self", delta: 1 }], note: "队伍全队口径待校准（当前在场）" },
  { name: "强制过滤", trigger: "beforeDamage", when: [SELF("强制过滤")], effects: [{ type: "setHits", target: "self", hits: 1 }] },
  { name: "无差别过滤", trigger: "beforeDamage", when: [SELF("无差别过滤")], effects: [{ type: "setHits", target: "self", hits: 2 }] },
  { name: "渴求", trigger: "onEntry", when: [ENTER("渴求")], effects: [{ type: "addCounter", target: "self", key: "lifesteal", delta: 0.5 }] },
  { name: "贪得无厌", trigger: "onEntry", when: [ENTER("贪得无厌")], effects: [{ type: "addCounter", target: "self", key: "lifesteal", delta: 0.5 }], note: "过量回复转物攻待校准" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Set(file.mechanisms.map((m) => m.id));
const generated = [];
for (const t of traits) {
  const sprites = byName.get(t.traitName ?? t.name);
  if (!sprites?.length) { console.log("  ! 未找到特性:", t.name); continue; }
  let id = `trait:${sprites[0]}`;
  let i = 2;
  while (existing.has(id) || generated.some((g) => g.id === id)) id = `trait:${sprites[0]}#${i++}`;
  generated.push({ id, ownerType: "trait", ownerId: sprites[0], trigger: t.trigger, when: t.when, effects: t.effects, note: `特性「${t.traitName ?? t.name}」${t.note ? "：" + t.note : ""}` });
}

console.log(`生成 ${generated.length} 条`);
if (generated.length === 0) process.exit(0);
file.mechanisms.push(...generated);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
