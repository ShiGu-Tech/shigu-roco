import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 等价交换：防御技「应对攻击 → 自己获得 50% 吸血」——把原 unsupported 应对分支替换为 lifesteal 计数器。
const patch = [{ id: "sk-7180210", name: "等价交换", effects: [{ type: "addCounter", target: "self", key: "lifesteal", delta: 0.5 }], note: "应对攻击 → 自己获得 50% 吸血" }];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const byId = new Map(file.mechanisms.map((m) => [m.id, m]));
let patched = 0;
for (const p of patch) {
  const m = byId.get(`skill:${p.id}:declare`);
  if (!m) { console.log("  ! 未找到 declare:", p.id); continue; }
  m.effects = m.effects.filter((e) => e.type !== "unsupported");
  m.effects.push(...p.effects);
  m.note = `${p.name}：应对攻击成功 → 必定先手 + 本回合承伤减伤；${p.note}`;
  patched++;
}

if (patched === 0) { console.log("无改动"); process.exit(0); }
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条，替换 ${patched}）`); }
else console.log("dry-run");
