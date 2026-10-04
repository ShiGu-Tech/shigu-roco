import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { getBundle } from "../server";
import { Simulator } from "../simulator/battle";
import { makeActive, makeSide, makeState } from "../state";
import type { Dict } from "../types";

const bundle = getBundle();

function spriteWithTrait(name: string): string {
  const hit = Object.entries(bundle.sprites as Record<string, Dict>).find(([, v]) => (v.trait as Dict | undefined)?.name === name);
  if (!hit) throw new Error(`no sprite with trait ${name}`);
  return hit[0];
}

function skillBy(pred: (s: Dict) => boolean, message = "no skill"): string {
  for (const s of Object.values(bundle.skills as Record<string, Dict>)) if (pred(s)) return String(s.id);
  throw new Error(message);
}

const ruleOf = (trait: string, key: string): unknown => {
  const state = makeState(makeSide(makeActive(spriteWithTrait(trait), { hp: 500, maxHp: 500, energy: 20 })), makeSide(makeActive("sp-14-1")));
  return new Simulator(bundle).mechanisms.ruleModifiers(state, bundle, "player")[key];
};

describe("closeout: 选择分支 / 巧变 / 全队被动 / 继承 / 重放 / 半量", () => {
  it("连续负荷 / 狂欢开始 / 光度换算 / 长久保存制法：规则覆盖登记", () => {
    expect(ruleOf("连续负荷", "burst.extend")).toBe(1);
    expect(ruleOf("狂欢开始", "damage.superEffectiveTaken")).toBe(0.25);
    expect(ruleOf("光度换算", "choice.element.Fire")).toBe(true);
    expect(ruleOf("长久保存制法", "choice.energy")).toBe(true);
  });

  it("狂欢开始：受克伤规则 + 入场随机召唤 3 只（标记 summonedBy）", () => {
    const trait = spriteWithTrait("狂欢开始");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.bench.length).toBe(3);
    expect(t.state.player.bench.every((s) => s.summonedBy === trait)).toBe(true);
    // 召唤精灵只能换回召唤者：把召唤者换下、召唤精灵上场后，其合法换人只剩召唤者。
    const summoned = t.state.player.bench[0];
    new Simulator(bundle).doSwitch(t.state, "player", summoned.spriteId, false);
    const actions = new Simulator(bundle).legalActions(t.state, "player");
    const targets = actions.filter((a) => a.kind === "switch").map((a) => a.benchId);
    expect(targets).toEqual([trait]);
    // 反复入场不重复召唤：换回召唤者后再入场，被召唤精灵数量仍为 3。
    new Simulator(bundle).doSwitch(t.state, "player", trait, false);
    const t2 = new Simulator(bundle).step(t.state, { kind: "energy" }, { kind: "energy" }, new Rng(2));
    expect(t2.state.player.bench.filter((s) => s.summonedBy === trait).length).toBe(3);
  });

  it("踏雷：攻击技能复制已触发迸发效果（重放不递归）", () => {
    const burstSkill = skillBy((s) => Boolean((s.tags as string[] | undefined)?.includes("burst")) && (s.category === "Physical" || s.category === "Magic"), "no burst attack");
    const sim = new Simulator(bundle);
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [burstSkill, "sk-7110460"];
    let r = sim.step(state, { kind: "skill", skillId: burstSkill }, { kind: "energy" }, new Rng(1));
    expect(r.state.player.active.counters?.[`burstTriggered.${burstSkill}`]).toBe(1);
    r = sim.step(r.state, { kind: "skill", skillId: "sk-7110460" }, { kind: "energy" }, new Rng(2));
    expect(r.state.player.active.counters?.replayBurst).toBe(1);
    r = sim.step(r.state, { kind: "skill", skillId: burstSkill }, { kind: "energy" }, new Rng(3));
    expect(r.events.some((e) => e.type === "skills-replayed")).toBe(true);
    expect(r.state.player.active.counters?.replayBurst).toBeUndefined();
  });

  it("光度换算：火系技能选择·暗 → 失去 15% 生命 + 光系威力永久 +30", () => {
    const trait = spriteWithTrait("光度换算");
    const fire = skillBy((s) => s.element === "Fire" && (s.category === "Physical" || s.category === "Magic"), "no fire skill");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 400, maxHp: 400, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [fire];
    const acts = new Simulator(bundle).legalActions(state, "player");
    expect(acts.some((a) => a.kind === "skill" && a.skillId === fire && a.choice === 1)).toBe(true);
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: fire, choice: 1 }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.counters?.["power-add:Light"]).toBe(30);
    expect(t.state.player.active.hp).toBeLessThanOrEqual(400 - 60);
  });

  it("长久保存制法：聚能·暗 → 偷取敌方 3 能量", () => {
    const trait = spriteWithTrait("长久保存制法");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 0 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 10 })),
    );
    const acts = new Simulator(bundle).legalActions(state, "player");
    expect(acts.some((a) => a.kind === "energy" && a.choice === 1)).toBe(true);
    const t = new Simulator(bundle).step(state, { kind: "energy", choice: 1 }, { kind: "wish" }, new Rng(1));
    expect(t.state.player.active.energy).toBeGreaterThanOrEqual(8);
    expect(t.state.enemy.active.energy).toBeLessThanOrEqual(7);
  });

  it("换碟：使用音波弹后变为同系（普通）随机技能", () => {
    const trait = spriteWithTrait("换碟");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = ["sk-7020890"];
    const t = new Simulator(bundle).step(state, { kind: "skill", skillId: "sk-7020890" }, { kind: "energy" }, new Rng(1));
    const changed = t.state.player.active.loadout[0];
    expect(changed).not.toBe("sk-7020890");
    expect((bundle.skills[changed] as Dict).element).toBe("Normal");
  });

  it("博物：回合开始识破敌方伪装", () => {
    const trait = spriteWithTrait("博物");
    const state = makeState(
      makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-15-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.enemy.active.disguise = "sp-14-1";
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.enemy.active.disguise).toBeUndefined();
    expect(t.state.enemy.active.spriteId).toBe("sp-14-1");
  });

  it("正模标本：队友力竭 1 回合后变为未完虫", () => {
    const holder = spriteWithTrait("正模标本");
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 0, maxHp: 500, energy: 20 }), { bench: [makeActive(holder, { hp: 500, maxHp: 500 })] }),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    const sim = new Simulator(bundle);
    let r = sim.step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(r.state.player.active.reviveDue).toBe(2);
    r = sim.step(r.state, { kind: "energy" }, { kind: "energy" }, new Rng(2));
    expect(r.state.player.active.spriteId).toBe(holder);
    expect(r.state.player.active.hp).toBeGreaterThan(0);
  });

  it("铭记于月亮：击败者继承被击败者的被动特性", () => {
    const moon = spriteWithTrait("铭记于月亮");
    const victim = spriteWithTrait("展翅");
    const state = makeState(
      makeSide(makeActive(moon, { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive(victim, { hp: 0, maxHp: 500, energy: 20 })),
    );
    state.enemy.lastHit = { side: "player" };
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.ruleOverrides?.["element.normalToWing"]).toBe(true);
  });

  it("无畏之心：减免伤害转为回复自己生命", () => {
    const attack = skillBy((s) => (s.category === "Physical" || s.category === "Magic") && Number(s.power) >= 60, "no strong attack");
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 200, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.statuses["def-7020810"] = 1;
    state.enemy.active.loadout = [attack];
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "skill", skillId: attack }, new Rng(1));
    expect(t.state.player.active.hp).toBeGreaterThan(200);
  });

  it("疾风连袭：重放已用迅捷技能", () => {
    const quick = skillBy((s) => Boolean((s.tags as string[] | undefined)?.includes("quick")) && (s.category === "Physical" || s.category === "Magic") && Number(s.power) > 0, "no quick attack");
    const sim = new Simulator(bundle);
    const state = makeState(
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
      makeSide(makeActive("sp-14-1", { hp: 500, maxHp: 500, energy: 20 })),
    );
    state.player.active.loadout = [quick, "sk-7150320"];
    const r1 = sim.step(state, { kind: "skill", skillId: quick }, { kind: "energy" }, new Rng(1));
    const hpAfterQuick = r1.state.enemy.active.hp;
    const r2 = sim.step(r1.state, { kind: "skill", skillId: "sk-7150320" }, { kind: "energy" }, new Rng(2));
    expect(r2.state.enemy.active.hp).toBeLessThan(hpAfterQuick);
  });

  it("棱镜球：入场随机化为具体球种并标记半量", () => {
    const trait = spriteWithTrait("契约的形状");
    const state = makeState(makeSide(makeActive(trait, { hp: 500, maxHp: 500, energy: 20, profile: { ball: "prism" } })), makeSide(makeActive("sp-14-1")));
    const t = new Simulator(bundle).step(state, { kind: "energy" }, { kind: "energy" }, new Rng(1));
    expect(t.state.player.active.ball).not.toBe("prism");
    expect(t.state.player.active.counters?.prismHalf).toBe(1);
  });
});
