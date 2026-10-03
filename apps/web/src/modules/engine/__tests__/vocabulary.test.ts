import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EFFECT_VOCABULARY, TRIGGER_NAMES, effectVocabularyOf, schemaPayload, triggerMetaOf } from "../mechanisms/vocabulary";

interface RawEffect {
  type?: string;
  effects?: RawEffect[];
  effectsPerLayer?: RawEffect[];
  effectsOnConsume?: RawEffect[];
}

interface RawMechanism {
  id: string;
  trigger?: string;
  effects?: RawEffect[];
}

const mechanisms = JSON.parse(
  readFileSync(new URL("../../../../../../data/mechanisms.json", import.meta.url), "utf8"),
) as { mechanisms: RawMechanism[] };

function collectEffectTypes(effects: RawEffect[] | undefined, out: Set<string>): void {
  for (const effect of effects ?? []) {
    if (effect.type) out.add(effect.type);
    collectEffectTypes(effect.effects, out);
    collectEffectTypes(effect.effectsPerLayer, out);
    collectEffectTypes(effect.effectsOnConsume, out);
  }
}

describe("机制 DSL 词汇 · 漂移守卫", () => {
  it("data/mechanisms.json 用到的 effect type 全部有词汇条目", () => {
    const used = new Set<string>();
    for (const mechanism of mechanisms.mechanisms) collectEffectTypes(mechanism.effects, used);
    const known = new Set(EFFECT_VOCABULARY.map((e) => e.type));
    const missing = [...used].filter((type) => !known.has(type)).sort();
    expect(missing).toEqual([]);
  });

  it("data/mechanisms.json 用到的 trigger 全部有词汇条目", () => {
    const used = new Set<string>();
    for (const mechanism of mechanisms.mechanisms) if (mechanism.trigger) used.add(mechanism.trigger);
    const missing = [...used].filter((name) => !TRIGGER_NAMES.includes(name)).sort();
    expect(missing).toEqual([]);
  });

  it("词汇表自身无重复、查表不回落", () => {
    const effectTypes = EFFECT_VOCABULARY.map((e) => e.type);
    expect(new Set(effectTypes).size).toBe(effectTypes.length);
    const triggerNames = TRIGGER_NAMES;
    expect(new Set(triggerNames).size).toBe(triggerNames.length);
    for (const type of effectTypes) expect(effectVocabularyOf(type).title).not.toBe("");
    for (const name of triggerNames) expect(triggerMetaOf(name).title).not.toBe("");
    expect(effectVocabularyOf("dealDamage").domain).toBe("damage");
    expect(effectVocabularyOf("不存在").domain).toBe("other");
    expect(triggerMetaOf("onEntry").phase).toBe("switch");
    expect(triggerMetaOf("不存在").phase).toBe("other");
  });

  it("schema 载荷包含全部词汇面", () => {
    const schema = schemaPayload() as Record<string, unknown>;
    expect((schema.triggers as unknown[]).length).toBe(TRIGGER_NAMES.length);
    expect((schema.effects as unknown[]).length).toBe(EFFECT_VOCABULARY.length);
    expect(schema.conditionOps).toBeTruthy();
    expect(schema.domains).toBeTruthy();
  });
});
