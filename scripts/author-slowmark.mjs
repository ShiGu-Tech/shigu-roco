import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 减速印记：获得印记时速度 -10（markApplied 已由 runtime 派发，纯数据）。
const id = "slow-mark";
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const m = file.mechanisms.find((x) => x.id === `mark:${id}`);
if (!m) { console.log("未找到 mark:slow-mark"); process.exit(1); }
m.trigger = "markApplied";
m.when = [{ path: "event.markId", op: "eq", value: id }];
m.effects = [{ type: "modifyStat", target: "self", stat: "speed", mode: "flat", value: -10 }];
m.note = "减速印记：获得时速度 −10（术语 1032；层数口径待校准）";

const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}）`); }
else console.log("dry-run");
