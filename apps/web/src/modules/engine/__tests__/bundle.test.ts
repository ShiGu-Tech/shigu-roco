import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundlePayload } from "../api/handlers";
import { buildBundle } from "../data";
import { Rng } from "../rng";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { DataBundle, Dict, RawDataFiles } from "../types";

const RAW = "x".repeat(2048);

const bundle: DataBundle = {
  sprites: {
    "sp-1-1": { id: "sp-1-1", name: "迪莫", race: { hp: 100 }, skillList: ["sk-1"], sourceData: { raw: RAW } },
  },
  skills: {
    "sk-1": { id: "sk-1", category: "Physical", power: 50, sourceData: { raw: RAW } },
  },
  statuses: { poison: { id: "poison", sourceData: { raw: RAW } } },
  marks: { "poison-mark": { id: "poison-mark", sourceData: { raw: RAW } } },
  weather: { sandstorm: { id: "sandstorm", sourceData: { raw: RAW } } },
  elements: { elements: [] },
  rules: {},
  stats: {},
  assets: {},
  mechanisms: [
    { id: "registered:skill:sk-1", ownerType: "skill", ownerId: "sk-1", trigger: "beforeAction", effects: [] },
  ],
  warnings: [],
  dataVersion: "test-v1",
  dataUpdatedAt: "2026-09-28T00:00:00.000Z",
};

describe("bundle payload", () => {
  it("strips sourceData and keeps the runtime shape", () => {
    const payload = bundlePayload(bundle);
    const sprites = (payload.sprites as { sprites: Dict[]; version: string }).sprites;
    const skills = (payload.skills as { skills: Dict[] }).skills;
    expect(sprites[0].sourceData).toBeUndefined();
    expect(skills[0].sourceData).toBeUndefined();
    expect(sprites[0].race).toEqual({ hp: 100 });
    expect((payload.sprites as { version: string }).version).toBe("test-v1");
  });

  it("carries mechanisms so the worker can deal damage", () => {
    const payload = bundlePayload(bundle);
    expect((payload.mechanisms as Dict[]).map((m) => m.id)).toEqual(["registered:skill:sk-1"]);
  });
});

// 入仓静态包 public/data/bundle.json：守卫「数据更新后必须重新导出」。
const raw = JSON.parse(
  readFileSync(new URL("../../../../public/data/bundle.json", import.meta.url), "utf8"),
) as RawDataFiles;
const staticBundle = buildBundle(raw);

function damagingSkill(spriteId: string): string | null {
  const sprite = staticBundle.sprites[spriteId];
  for (const id of (sprite?.skillList as string[]) ?? []) {
    const skill = staticBundle.skills[id];
    if (skill && (skill.category === "Physical" || skill.category === "Magic") && Number(skill.power) > 0) return id;
  }
  return null;
}

describe("static bundle", () => {
  it("loads, keeps mechanisms, and deals damage in the simulator", () => {
    expect(Object.keys(staticBundle.sprites).length).toBeGreaterThan(600);
    expect((staticBundle.mechanisms as Dict[] | undefined)?.length ?? 0).toBeGreaterThan(0);
    const playerSkill = damagingSkill("sp-1-1");
    const enemySkill = damagingSkill("sp-14-1");
    expect(playerSkill).toBeTruthy();
    expect(enemySkill).toBeTruthy();
    const state = makeState(
      makeSide(makeActive("sp-1-1", { hp: 300, maxHp: 300, energy: 10 })),
      makeSide(makeActive("sp-14-1", { hp: 300, maxHp: 300, energy: 10 })),
    );
    const result = new Simulator(staticBundle).step(
      state,
      { kind: "skill", skillId: playerSkill! },
      { kind: "skill", skillId: enemySkill! },
      new Rng(1),
    );
    expect(result.state.enemy.active.hp < 300 || result.state.player.active.hp < 300).toBe(true);
  });
});
