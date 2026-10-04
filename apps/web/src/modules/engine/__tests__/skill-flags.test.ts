import { describe, expect, it } from "vitest";
import { getBundle } from "../server";
import type { Dict } from "../types";
import { toArray } from "../types";

const bundle = getBundle();
const skills = Object.values(bundle.skills as Record<string, Dict>);

const EXTRA_EFFECT = /回复|获得|使|附加|印记|蓄力|连击|免疫|降低|提升|先手|应对|吸血|清除|交换|封印|混乱|中毒|灼烧|冻结|寄生|魔攻|物攻|双防|防御|速度|能耗|命中|暴击|无视|选择|巧变|迸发|传动|奉献|反转|复制|偷取|驱散|随机|偷|夺/;

describe("技能标记派生（摄取适配层）", () => {
  it("charge：与「描述以蓄力开头」完全一致，且都有 beginCharge 机制", () => {
    const mechanisms = toArray<Dict>(bundle.mechanisms);
    const chargeByMech = new Set(
      mechanisms
        .filter((m) => m.ownerType === "skill" && toArray<Dict>(m.effects).some((e) => e.type === "beginCharge"))
        .map((m) => String(m.ownerId)),
    );
    const marked = skills.filter((s) => s.charge === true).map((s) => String(s.id));
    const byText = skills.filter((s) => String(s.description ?? "").trim().startsWith("蓄力")).map((s) => String(s.id));
    expect(new Set(marked)).toEqual(chargeByMech);
    expect(new Set(marked)).toEqual(new Set(byText));
  });

  it("choice：与「描述含选择」一致", () => {
    const marked = new Set(skills.filter((s) => s.choice === true).map((s) => String(s.id)));
    const byText = new Set(skills.filter((s) => String(s.description ?? "").includes("选择")).map((s) => String(s.id)));
    expect(marked).toEqual(byText);
  });

  it("quick：与「描述含迅捷（排除获得 / 汇总）」一致", () => {
    const marked = new Set(skills.filter((s) => s.quick === true).map((s) => String(s.id)));
    const byText = new Set(
      skills
        .filter((s) => {
          const desc = String(s.description ?? "");
          return desc.includes("迅捷") && !desc.includes("获得迅捷") && !desc.includes("迅捷技能");
        })
        .map((s) => String(s.id)),
    );
    expect(marked).toEqual(byText);
  });

  it("simple：攻击技且描述无附加效果", () => {
    const marked = new Set(skills.filter((s) => s.simple === true).map((s) => String(s.id)));
    const byText = new Set(
      skills
        .filter((s) => (s.category === "Physical" || s.category === "Magic") && !EXTRA_EFFECT.test(String(s.description ?? "")))
        .map((s) => String(s.id)),
    );
    expect(marked).toEqual(byText);
  });

  it("不再保留历史 tags 字段", () => {
    expect(skills.every((s) => s.tags === undefined)).toBe(true);
  });
});
