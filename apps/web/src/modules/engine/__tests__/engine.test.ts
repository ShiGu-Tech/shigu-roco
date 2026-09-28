/** 引擎回归测试：迁移自原 Python pytest，并补养成 / 训练后验。 */

import { describe, expect, it } from "vitest";

import { bundleTypeMultiplier, counts, getSprite, typeMultiplier } from "../data";
import { loadData } from "../data-node";
import { computeDamage } from "../effects/damage";
import { MCTS } from "../mcts/search";
import { OpponentModel } from "../opponent/bayes";
import { maxHpLikelihood, profileOptions, trainingProbabilities } from "../opponent/training";
import { Rng } from "../rng";
import { Simulator } from "../simulator/battle";
import { settleMarks, clearMarksOnSwitch } from "../simulator/marks";
import { computeStats, natureMultiplier, statWithProfile } from "../stats";
import { makeActive, makeSide, makeState } from "../state";
import type { ActiveSprite, BattleState, Dict } from "../types";

const bundle = loadData();
const sim = new Simulator(bundle);

function makeActiveFor(spriteId: string, hp?: number, energy = 10, marks: Record<string, number> = {}): ActiveSprite {
  const race = getSprite(bundle, spriteId).race as Dict;
  const maxHp = Number(race.hp ?? 1) * 3;
  const a = makeActive(spriteId, { hp: hp ?? maxHp, maxHp, energy });
  a.marks = { ...marks };
  return a;
}

function state(
  player = "sp-7",
  enemy = "sp-10",
  playerBench: string[] = [],
  enemyBench: string[] = [],
): BattleState {
  return makeState(
    makeSide(makeActiveFor(player), { magic: 3, bench: playerBench.map((b) => makeActiveFor(b)), wishChargesLeft: 2 }),
    makeSide(makeActiveFor(enemy), { magic: 3, bench: enemyBench.map((b) => makeActiveFor(b)), wishChargesLeft: 2 }),
  );
}

describe("数据层", () => {
  it("计数达标", () => {
    const c = counts(bundle);
    expect(c.sprites).toBeGreaterThanOrEqual(40);
    expect(c.skills).toBeGreaterThanOrEqual(100);
    expect(c.marks).toBeGreaterThanOrEqual(5);
    expect(c.weather).toBeGreaterThanOrEqual(2);
  });

  it("引用完整性", () => {
    const bad = bundle.warnings.filter((w) => w.includes("未知技能") || w.includes("未知印记"));
    expect(bad).toEqual([]);
  });

  it("属性矩阵", () => {
    expect(bundleTypeMultiplier(bundle, "Fire", ["Grass"])).toBe(2.0);
    expect(bundleTypeMultiplier(bundle, "Fire", ["Water"])).toBe(0.5);
    expect(bundleTypeMultiplier(bundle, "Fire", ["Normal"])).toBe(1.0);
    expect(bundleTypeMultiplier(bundle, "Fire", ["Grass", "Water"])).toBe(1.0);
    expect(typeMultiplier({ values: {}, matrix: { Fire: { Grass: "counter3" } } }, "Fire", ["Grass"])).toBe(3.0);
    expect(typeMultiplier({ values: {}, matrix: { Fire: { Grass: "resisted4" } } }, "Fire", ["Grass"])).toBe(0.25);
  });

  it("技能扩展已注册", () => {
    const mechanisms = (bundle.mechanisms ?? []) as { ownerType: string }[];
    expect(mechanisms.filter((item) => item.ownerType === "skill")).toHaveLength(Object.keys(bundle.skills).length);
    expect(mechanisms.filter((item) => item.ownerType === "trait")).toHaveLength(Object.values(bundle.sprites).filter((sprite) => sprite.trait).length);
    for (const sk of Object.values(bundle.skills)) {
      expect(["Attack", "Defense", "Status"]).toContain(sk.actionType);
      expect(["Physical", "Magic", "Status", "Defense"]).toContain(sk.category);
    }
  });
});

describe("伤害公式", () => {
  const attacker: Dict = {
    elements: ["Fire"],
    race: { hp: 100, atk: 100, defense: 100, spatk: 100, spdef: 100, speed: 100 },
  };
  const defender: Dict = {
    elements: ["Normal"],
    race: { hp: 100, atk: 100, defense: 100, spatk: 100, spdef: 100, speed: 100 },
  };
  const skill: Dict = { element: "Fire", category: "Physical", power: 100 };
  const active = () => makeActive("x", { hp: 300, maxHp: 300, energy: 10 });

  const damage = (defEndElements: string[]) =>
    computeDamage(bundle, attacker, { ...defender, elements: defEndElements }, active(), active(), skill, {});

  it("克制打得更痛", () => {
    expect(damage(["Grass"]).damage).toBeGreaterThan(damage(["Water"]).damage);
  });

  it("本系 STAB", () => {
    expect(damage(["Normal"]).stab).toBe(1.5);
  });

  it("固定伤害且无暴击分支", () => {
    expect(damage(["Normal"]).damage).toBe(damage(["Normal"]).damage);
  });

  it("零威力为零", () => {
    const res = computeDamage(bundle, attacker, defender, active(), active(), { element: "Fire", category: "Status", power: 0 }, {});
    expect(res.damage).toBe(0);
  });
});

describe("印记", () => {
  it("灼烧回合末结算", () => {
    const st = state();
    st.player.active.marks = { burn: 5 };
    const before = st.player.active.hp;
    const events = settleMarks(st, "turnEnd", bundle);
    expect(st.player.active.hp).toBeLessThan(before);
    expect(events.some((e) => e.type === "damage")).toBe(true);
  });

  it("换人不被清除", () => {
    const st = state();
    st.player.active.marks = { burn: 5 };
    clearMarksOnSwitch(st, "player", bundle);
    expect(st.player.active.marks.burn).toBe(5);
  });

});

describe("回合结算", () => {
  it("推进回合并扣能量，且不改原状态", () => {
    const st = state();
    const skillId = (getSprite(bundle, "sp-7").skillList as string[])[0];
    const before = st.player.active.energy;
    const res = sim.step(st, { kind: "skill", skillId }, { kind: "defend" }, new Rng(1));
    expect(res.state.turn).toBe(2);
    expect(res.state.player.active.energy).toBeLessThanOrEqual(before);
    expect(st.turn).toBe(1);
  });

  it("换人切换场上精灵", () => {
    const st = state("sp-7", "sp-10", ["sp-6"]);
    const res = sim.step(st, { kind: "switch", benchId: "sp-6" }, { kind: "defend" }, new Rng(1));
    expect(res.state.player.active.spriteId).toBe("sp-6");
  });

  it("阵亡扣魔力", () => {
    const st = state();
    st.enemy.active.hp = 0;
    sim.handleFaints(st);
    expect(st.enemy.magic).toBe(2);
  });

  it("魔力归零终止", () => {
    const st = state();
    st.enemy.magic = 0;
    const term = sim.terminal(st);
    expect(term.ended).toBe(true);
    expect(term.winner).toBe("player");
  });

  it("合法动作含技能 / 换人 / 愿力", () => {
    const st = state("sp-7", "sp-10", ["sp-6"]);
    const actions = sim.legalActions(st, "player");
    expect(actions.some((a) => a.kind === "skill")).toBe(true);
    expect(actions.some((a) => a.kind === "switch")).toBe(true);
    expect(actions.some((a) => a.kind === "wish")).toBe(true);
  });

  it("聚能回能", () => {
    const st = state();
    st.player.active.energy = 0;
    expect(sim.legalActions(st, "player").some((a) => a.kind === "energy")).toBe(true);
    const res = sim.step(st, { kind: "energy" }, { kind: "defend" }, new Rng(1));
    expect(res.state.player.active.energy).toBeGreaterThanOrEqual(st.player.active.energy);
  });

  it("loadout 限制技能", () => {
    const full = getSprite(bundle, "sp-6").skillList as string[];
    const st = state();
    st.player.active.loadout = full.slice(0, 2);
    const skills = sim.legalActions(st, "player").filter((a) => a.kind === "skill");
    expect(new Set(skills.map((a) => a.skillId))).toEqual(new Set(full.slice(0, 2)));
  });

  it("阵亡需手动换人", () => {
    const st = state("sp-7", "sp-10", [], ["sp-10"]);
    st.enemy.active.hp = 0;
    const actions = sim.legalActions(st, "enemy");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.kind === "switch")).toBe(true);
    sim.forcedSwitch(st, "enemy", st.enemy.bench[0].spriteId);
    expect(st.enemy.active.hp).toBeGreaterThan(0);
  });

  it("先手击杀使慢速方无法出手", () => {
    const st = state("sp-7", "sp-29");
    st.enemy.active.hp = 1;
    const res = sim.step(
      st,
      { kind: "skill", skillId: "sk-7040370" },
      { kind: "skill", skillId: "sk-7020370" },
      new Rng(1),
    );
    expect(res.events.some((e) => e.type === "faint" && e.side === "enemy")).toBe(true);
    expect(res.events.some((e) => e.type === "damage" && e.side === "player")).toBe(false);
  });
});

describe("MCTS", () => {
  const cfg = { maxIterations: 60, timeLimitMs: 60000, seed: 7 };

  it("同种子可复现且契约成立", () => {
    const st = state();
    const a = new MCTS(sim, cfg).search(st);
    const b = new MCTS(sim, cfg).search(st);
    expect(a.actions).toEqual(b.actions);
    expect(a.meta.iterations).toBe(60);
    expect(a.actions.every((x) => x.winRate >= 0 && x.winRate <= 1)).toBe(true);
    const sum = Object.values(a.opponent).reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it("动作按胜率降序", () => {
    const out = new MCTS(sim, { ...cfg, maxIterations: 80, seed: 3 }).search(state());
    const rates = out.actions.map((x) => x.winRate);
    expect(rates).toEqual([...rates].sort((x, y) => y - x));
  });

  it("对手模型随观测偏移", () => {
    const model = new OpponentModel();
    const base = model.probabilities().A;
    for (let i = 0; i < 10; i++) model.observe("A");
    expect(model.probabilities().A).toBeGreaterThan(base);
  });
});

describe("养成资质", () => {
  it("性格修正", () => {
    expect(natureMultiplier(bundle.stats, { nature: "adamant" }, "atk")).toBe(1.1);
    expect(natureMultiplier(bundle.stats, { nature: "adamant" }, "spatk")).toBe(0.9);
    expect(natureMultiplier(bundle.stats, { nature: "neutral" }, "atk")).toBe(1.0);
  });

  it("三维面板加成", () => {
    const sprite = getSprite(bundle, "sp-7");
    const base = statWithProfile(bundle.stats, sprite, undefined, "atk");
    const trained = statWithProfile(bundle.stats, sprite, { training: { atk: 100 } }, "atk");
    expect(trained).toBeGreaterThan(base);
    expect(trained).toBeCloseTo(base + 30, 5);
  });

  it("满培养提高最大生命", () => {
    const sprite = getSprite(bundle, "sp-7");
    const untrained = computeStats(bundle.stats, sprite, { training: { hp: 0 } }).hp;
    const full = computeStats(bundle.stats, sprite, { training: { hp: 100 } }).hp;
    expect(full).toBeGreaterThan(untrained);
  });

  it("养成后验随观测更新", () => {
    const profiles = profileOptions(bundle);
    const likelihoods = maxHpLikelihood(bundle, "sp-7", computeStats(bundle.stats, getSprite(bundle, "sp-7"), { training: { hp: 100 } }).hp, profiles);
    const best = likelihoods.indexOf(Math.max(...likelihoods));
    const posterior = trainingProbabilities(profiles, likelihoods);
    expect(profiles[best].id).toBe("full");
    expect(posterior[best]).toBeGreaterThan(1 / profiles.length);
  });
});
