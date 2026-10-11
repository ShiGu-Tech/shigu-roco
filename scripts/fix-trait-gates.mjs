/** 修：给缺主人门控的 trait 机制补 `self.active.spriteId ∈ <同编号全部形态>` 门控。
 *  确认中招：sp-307-1（绒粉星光 ×2 出伤）、sp-310-1（月光审判）、sp-358-1（换碟）。 */
import fs from "node:fs";
const FILE = "data/mechanisms.json";
const CAT = "data/registry/catalogs/f2bc7789ad9c-20260930085840-n8/catalog.json";
const write = process.argv.includes("--write");

const cat = JSON.parse(fs.readFileSync(CAT, "utf8"));
const byNo = new Map();
for (const s of cat.sprites) {
  const no = s.no;
  if (no == null) continue;
  (byNo.get(no) ?? byNo.set(no, []).get(no)).push(String(s.id));
}
const formsOf = (ownerId) => {
  const m = String(ownerId).match(/^sp-(\d+)/);
  return m ? (byNo.get(Number(m[1])) ?? [String(ownerId)]) : [String(ownerId)];
};

const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
let fixed = 0;
for (const m of file.mechanisms) {
  if (m.ownerType !== "trait") continue;
  const ownerId = String(m.ownerId);
  if (!["sp-307-1", "sp-310-1", "sp-358-1"].includes(ownerId)) continue;
  if (JSON.stringify(m.when ?? []).includes("priteId")) continue;
  const allow = formsOf(ownerId);
  m.when = [{ path: "self.active.spriteId", op: "in", value: allow }, ...(m.when ?? [])];
  m.note = (m.note ?? "") + "（补主人门控）";
  fixed++;
  console.log("补门控:", m.id, "->", JSON.stringify(allow));
}
console.log(`共补 ${fixed} 条`);
if (!fixed) process.exit(0);
if (write) {
  const [a, b] = String(file.version).split(".").map(Number);
  file.version = `${a}.${b + 1}.0`;
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`已写入（version ${file.version}）`);
} else console.log("dry-run：加 --write 落盘");
