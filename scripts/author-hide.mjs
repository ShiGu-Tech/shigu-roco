import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 信息隐藏状态：木桶 / 月陨星——自己行动或被敌方攻击时解除（隐藏信息本身是展示层，引擎只管解除时机）。
const stats = [
  { id: "wooden-barrel-state", name: "木桶状态" },
  { id: "moonfall-star-state", name: "月陨星状态" },
];

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existing = new Map(file.mechanisms.map((m) => [m.id, m]));
const generated = [];
for (const s of stats) {
  // 自己行动 → 解除
  generated.push({
    id: `status:${s.id}:on-act`,
    ownerType: "status",
    ownerId: s.id,
    trigger: "actionResolved",
    when: [{ path: `self.active.statuses.${s.id}`, op: "gte", value: 1 }],
    effects: [{ type: "removeStatus", target: "self", statusId: s.id }],
    note: `${s.name}：自己行动后解除（信息隐藏为展示层）`,
  });
  // 被敌方攻击 → 解除
  generated.push({
    id: `status:${s.id}:on-hit`,
    ownerType: "status",
    ownerId: s.id,
    trigger: "afterDamage",
    when: [{ path: `target.active.statuses.${s.id}`, op: "gte", value: 1 }],
    effects: [{ type: "removeStatus", target: "target", statusId: s.id }],
    note: `${s.name}：受到攻击后解除`,
  });
}

// 移除原来 passive + unsupported 的占位（保留第一条同名 id 会被覆盖，这里直接删占位）。
let removed = 0;
const unsupportedIds = stats.map((s) => `status:${s.id}`);
file.mechanisms = file.mechanisms.filter((m) => {
  if (unsupportedIds.includes(m.id) && m.effects.some((e) => e.type === "unsupported")) { removed++; return false; }
  return true;
});

const nowExisting = new Set(file.mechanisms.map((m) => m.id));
const toAdd = generated.filter((m) => !nowExisting.has(m.id));
console.log(`新增 ${toAdd.length} 条，移除 unsupported 占位 ${removed} 条`);
if (toAdd.length === 0 && removed === 0) { console.log("无改动"); process.exit(0); }
file.mechanisms.push(...toAdd);
const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}，共 ${file.mechanisms.length} 条）`); }
else console.log("dry-run");
