import { describe, expect, it } from "vitest";

import { workbenchMechanisms, workbenchSchema } from "../api/handlers";
import type { DataBundle, Dict } from "../types";

const bundle: DataBundle = {
  sprites: {
    "sp-1-1": { id: "sp-1-1", name: "迪莫", trait: { name: "光之源" }, skillList: ["sk-1"] },
  },
  skills: { "sk-1": { id: "sk-1", skillName: "魔能爆", category: "Magic", power: 80 } },
  statuses: { burn: { id: "burn", name: "灼烧" } },
  marks: { "starfall-mark": { id: "starfall-mark", name: "星陨印记" } },
  weather: { sandstorm: { id: "sandstorm", name: "沙暴" } },
  elements: {},
  rules: {},
  stats: {},
  assets: {},
  mechanisms: [
    {
      id: "skill:sk-1",
      ownerType: "skill",
      ownerId: "sk-1",
      trigger: "beforeAction",
      effects: [{ type: "dealDamage", power: 80 }, { type: "applyMark", markId: "starfall-mark", effectsOnConsume: [{ type: "unsupported", effectType: "诡异" }] }],
    },
    { id: "trait:sp-1", ownerType: "trait", ownerId: "sp-1", trigger: "battleStart", effects: [] },
    { id: "status:burn", ownerType: "status", ownerId: "burn", trigger: "turnEnd", effects: [{ type: "dealDamage", power: 10 }] },
    { id: "registered:skill:sk-9", ownerType: "skill", ownerId: "sk-9", trigger: "beforeAction", effects: [{ type: "dealDamage", power: 50 }] },
  ],
  warnings: [],
  dataVersion: "test-v1",
  dataUpdatedAt: "2026-10-03T00:00:00.000Z",
};

describe("workbench handlers", () => {
  it("schema 载荷暴露 trigger / 效果词汇", () => {
    const schema = workbenchSchema() as Dict;
    expect(Array.isArray(schema.triggers)).toBe(true);
    expect(Array.isArray(schema.effects)).toBe(true);
    expect((schema.effects as Dict[]).some((e) => e.type === "dealDamage")).toBe(true);
  });

  it("机制列表解析归属名、统计嵌套效果并标记 unsupported / registered", () => {
    const payload = workbenchMechanisms(bundle) as { mechanisms: Dict[] };
    const [skill, trait, status, registered] = payload.mechanisms;
    expect(skill).toMatchObject({ id: "skill:sk-1", ownerName: "魔能爆", effectCount: 3, unsupported: true, registered: false });
    expect(trait).toMatchObject({ ownerName: "迪莫 · 光之源" });
    expect(status).toMatchObject({ ownerName: "灼烧", effectCount: 1, unsupported: false });
    expect(registered).toMatchObject({ registered: true, ownerName: "sk-9" });
    expect((skill.def as Dict).trigger).toBe("beforeAction");
  });
});
