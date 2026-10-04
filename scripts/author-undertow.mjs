import fs from "node:fs";

const FILE = "data/mechanisms.json";
const write = process.argv.includes("--write");

// 暗涌印记：场上精灵离场后，换入精灵获得随机 5 层属性减益（afterSwitch + randomStatDebuff）。
const id = "undertow-mark";
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
const m = file.mechanisms.find((x) => x.id === `mark:${id}`);
if (!m) { console.log("未找到 mark:undertow-mark"); process.exit(1); }
m.trigger = "afterSwitch";
m.when = [{ path: `self.active.marks.${id}`, op: "gte", value: 1 }];
m.effects = [{ type: "randomStatDebuff", target: "self", layers: 5 }];
m.note = "暗涌印记：换入的精灵获得随机 5 层属性减益（术语 3020；分布口径待校准）";

const [a, b] = String(file.version).split(".").map(Number);
file.version = `${a}.${b + 1}.0`;
file.updatedAt = "2026-10-04";
if (write) { fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n"); console.log(`写入（version ${file.version}）`); }
else console.log("dry-run");
