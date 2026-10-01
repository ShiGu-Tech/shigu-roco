/** 预置示例阵容：首次进入 / 缺失时按种族自动配好性格 + 加点 + 出战技能，写入阵容库（localStorage）。 */

import { DEFAULT_LEVEL, DEFAULT_STARS, type PetSetup, type TeamEntry } from "@/modules/battle/pet";
import type { Catalog } from "@/modules/battle/types";
import { recommendBuild } from "@/modules/pets/recommend";
import { listLineups, saveLineup, type Lineup } from "./lineups";
import { spriteOf } from "./util";

interface PresetMember {
  spriteId: string;
  /** 指定出战技能（须在可学池内）；缺省取可学前 4 招。 */
  moves?: string[];
}

interface PresetTeam {
  name: string;
  members: PresetMember[];
}

/** 示例队（种族值靠前 / 系别搭配 / 星陨主题）。 */
const PRESET_TEAMS: PresetTeam[] = [
  {
    name: "示例 · 速攻队",
    members: ["sp-286-1", "sp-364-1", "sp-370-1", "sp-251-1", "sp-136-1", "sp-29-1"].map((spriteId) => ({ spriteId })),
  },
  {
    name: "示例 · 均衡队",
    members: ["sp-202-1", "sp-152-1", "sp-433-1", "sp-187-1", "sp-204-1", "sp-164-1"].map((spriteId) => ({ spriteId })),
  },
  {
    // 星陨队：幻系技能叠「星陨印记」，非幻系技能命中时引爆（消耗全部层数打出额外幻系伤害）。
    name: "示例 · 星陨队",
    members: [
      { spriteId: "sp-211-1", moves: ["sk-7190270", "sk-7190400", "sk-7190240", "sk-7020930"] }, // 迷迷箱怪：错乱 / 冥想 / 四维降解 / 压扁（普通引爆）
      { spriteId: "sp-337-1", moves: ["sk-7190280", "sk-7190330", "sk-7190260", "sk-7170220"] }, // 落陨星兔：超维投射 / 二律背反 / 多维击打 / 灵媒（幽系引爆）
      { spriteId: "sp-374-1", moves: ["sk-7190320", "sk-7190330", "sk-7190520", "sk-7060200"] }, // 帅帅魔偶：心灵洞悉 / 二律背反 / 引力偏转 / 虹光冲击（光系引爆）
      { spriteId: "sp-445-1", moves: ["sk-7190500", "sk-7190470", "sk-7170120", "sk-7020580"] }, // 银月狼王：量子涨落 / 月蚀 / 坟场搏击 / 气势一击（非幻引爆）
      { spriteId: "sp-465-1", moves: ["sk-7190280", "sk-7190500", "sk-7190370", "sk-7060180"] }, // 布灵布灵：超维投射 / 量子涨落 / 双星 / 光刃（光系引爆）
      { spriteId: "sp-347-1", moves: ["sk-7190280", "sk-7190330", "sk-7190270", "sk-7150220"] }, // 暮星辰：超维投射 / 二律背反 / 错乱 / 回旋风暴（翼系引爆）
    ],
  },
];

/** 自动配资质的单只 setup：性格 + 加点走 recommendBuild，出战技能按指定/可学池取 4 招。 */
function buildSetup(catalog: Catalog, member: PresetMember): PetSetup {
  const rec = recommendBuild(catalog, { spriteId: member.spriteId, stars: DEFAULT_STARS, nature: null });
  const sprite = spriteOf(catalog, member.spriteId);
  const learnable = sprite?.skills ?? [];
  const picked: string[] = [];
  for (const id of member.moves ?? []) {
    if (learnable.some((skill) => skill.id === id)) picked.push(id);
  }
  for (const skill of learnable) {
    if (picked.length >= 4) break;
    if (!picked.includes(skill.id)) picked.push(skill.id);
  }
  return {
    level: DEFAULT_LEVEL,
    stars: DEFAULT_STARS,
    nature: rec.nature,
    talent: rec.talent,
    skills: picked.slice(0, 4),
  };
}

/** 确保示例阵容存在（按队名幂等），返回最新的我方阵容库。 */
export function ensureSeedLineups(catalog: Catalog): Lineup[] {
  const existingNames = new Set(listLineups("player").map((l) => l.name));
  for (const team of PRESET_TEAMS) {
    if (existingNames.has(team.name)) continue;
    const entries: TeamEntry[] = team.members
      .filter((member) => catalog.sprites.some((s) => s.id === member.spriteId))
      .map((member) => ({ spriteId: member.spriteId, setup: buildSetup(catalog, member) }));
    if (entries.length > 0) saveLineup("player", team.name, entries);
  }
  return listLineups("player");
}
