/** 技能结构化标记（数据摄取适配层）：站点描述 + 机制事实 → 引擎可读字段。
 *
 * 站点文案格式只在本文件解析（`quick` / `simple` / `choice`）；引擎核心与运行时只读结构化字段，
 * 不出现任何中文关键词。`charge` 由机制事实（`beginCharge`）判定。
 * 标记现算、不落盘：注册图鉴只存描述，装配期（`buildBundle` / `getBundle`）重建。
 * 设计见 docs/modules/技能标记派生-设计-v0.1.md。
 */

import type { Dict } from "../types";
import { toArray, toStr } from "../types";

/** 攻击技能「附加效果」词表：命中即视为有附加，非 simple。 */
const EXTRA_EFFECT = /回复|获得|使|附加|印记|蓄力|连击|免疫|降低|提升|先手|应对|吸血|清除|交换|封印|混乱|中毒|灼烧|冻结|寄生|魔攻|物攻|双防|防御|速度|能耗|命中|暴击|无视|选择|巧变|迸发|传动|奉献|反转|复制|偷取|驱散|随机|偷|夺/;

/** 把站点描述解析为结构化标记（不含 charge，charge 来自机制）。 */
function textFlags(skill: Dict): Dict {
  const desc = toStr(skill.description);
  const flags: Dict = {};
  if (desc.includes("迅捷") && !desc.includes("获得迅捷") && !desc.includes("迅捷技能")) flags.quick = true;
  if ((skill.category === "Physical" || skill.category === "Magic") && !EXTRA_EFFECT.test(desc)) flags.simple = true;
  if (desc.includes("选择")) flags.choice = true;
  return flags;
}

/** 装配期标注：就地写入 `skill.{quick,simple,choice,charge}`，并清除历史 `tags` 与旧标记（幂等）。 */
export function annotateSkillFlags(skills: Record<string, Dict>, mechanisms: unknown): void {
  const chargeOwners = new Set<string>();
  for (const mechanism of toArray<Dict>(mechanisms)) {
    if (toStr(mechanism.ownerType) !== "skill") continue;
    if (!toArray<Dict>(mechanism.effects).some((effect) => toStr(effect.type) === "beginCharge")) continue;
    chargeOwners.add(toStr(mechanism.ownerId));
  }
  for (const skill of Object.values(skills)) {
    delete skill.tags;
    delete skill.quick;
    delete skill.simple;
    delete skill.choice;
    delete skill.charge;
    Object.assign(skill, textFlags(skill));
    if (chargeOwners.has(toStr(skill.id))) skill.charge = true;
  }
}
