// 第四期 · 咕噜球族：契约的形状（按捕捉球入场获得不同效果）。
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

const EFFECTIVE_BALLS = ["normal", "advanced", "king", "photosynthesis", "net", "thermostat", "sand", "insulation", "wonderful", "warlike", "darkstar", "transform"];
const POOL = EFFECTIVE_BALLS.join(",");

const traitNames = ["契约的形状"];
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const mechs = file.mechanisms;
for (let i = mechs.length - 1; i >= 0; i--) {
  if (mechs[i].ownerType === "trait" && traitNames.some((n) => String(mechs[i].note ?? "").startsWith(`特性「${n}」`))) mechs.splice(i, 1);
}

const added = [];
const s = ids("契约的形状");
if (s.length) {
  added.push({ id: `trait:${s[0]}#prism`, ownerType: "trait", ownerId: s[0], trigger: "passive", when: [{ path: "self.active.spriteId", op: "in", value: s }], effects: [{ type: "setRuleModifier", target: "self", key: "ball.prism.pool", value: POOL }], note: "特性「契约的形状」：棱镜球候选池" });

  const selfPct = (atk, def, spd) => [
    { type: "addCounter", target: "self", key: "pct-atk", delta: atk },
    { type: "addCounter", target: "self", key: "pct-defense", delta: def },
    { type: "addCounter", target: "self", key: "pct-speed", delta: spd },
  ];
  const BALLS = {
    normal: selfPct(0.05, 0.05, 0.05),
    advanced: selfPct(0.1, 0.1, 0.1),
    king: selfPct(0.15, 0.15, 0.15),
    photosynthesis: [{ type: "heal", target: "self", amount: 0.09, basis: "maxHp" }, { type: "addCounter", target: "self", key: "pct-spatk", delta: 0.4 }],
    net: [{ type: "modifySkillCost", target: "self", scope: "all", delta: -1, duration: "permanent" }, { type: "addCounter", target: "self", key: "hits-add", delta: 1 }],
    thermostat: [{ type: "applyStatus", target: "opponent", statusId: "burn", layers: 4 }, { type: "applyStatus", target: "opponent", statusId: "freeze", layers: 1 }],
    sand: [{ type: "addCounter", target: "opponent", key: "pct-defense", delta: -0.4 }, { type: "addCounter", target: "opponent", key: "flat-speed", delta: -40 }, { type: "addCounter", target: "opponent", key: "hits-add", delta: -2 }],
    insulation: [{ type: "addCounter", target: "self", key: "flat-speed", delta: 50 }, { type: "applyStatus", target: "opponent", statusId: "poison", layers: 1 }],
    wonderful: [{ type: "addCounter", target: "self", key: "power-add", delta: 20 }, { type: "addCounter", target: "opponent", key: "pct-atk", delta: -0.3 }, { type: "addCounter", target: "opponent", key: "pct-spatk", delta: -0.3 }],
    warlike: [{ type: "addCounter", target: "self", key: "pct-atk", delta: 0.4 }, { type: "addCounter", target: "opponent", key: "pct-spdef", delta: -0.4 }],
    darkstar: [{ type: "addCounter", target: "self", key: "lifesteal", delta: 0.3 }, { type: "modifyEnergy", target: "opponent", delta: -1 }],
    transform: [{ type: "addCounter", target: "self", key: "pct-defense", delta: 0.3 }, { type: "addCounter", target: "self", key: "pct-spdef", delta: 0.3 }, { type: "applyMark", target: "opponent", markId: "starfall-mark", layers: 1 }],
  };
  for (const [ball, effects] of Object.entries(BALLS)) {
    added.push({ id: `trait:${s[0]}#ball-${ball}`, ownerType: "trait", ownerId: s[0], trigger: "onEntry", when: [{ path: "self.active.spriteId", op: "in", value: s }, { path: "self.active.ball", op: "eq", value: ball }], effects, note: `特性「契约的形状」：${ball} 球入场效果` });
  }
}

mechs.push(...added);
console.log(`add ${added.length}`);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`; file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${mechs.length} 条）`); }
else console.log("dry-run");
