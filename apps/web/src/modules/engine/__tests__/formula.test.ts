import { describe, expect, it } from "vitest";
import { computeDamage } from "../effects/damage";
import { DEFAULT_FORMULA, evaluateFormula, resolveFormula, type FormulaSpec } from "../effects/formula";
import { makeActive } from "../state";
import type { DataBundle } from "../types";

const sprite = { id: "sp", elements: ["Fire"], race: { hp: 100, atk: 100, spatk: 100, defense: 100, spdef: 100, speed: 100 } };

function makeBundle(formula?: FormulaSpec): DataBundle {
  return {
    sprites: { sp: sprite },
    skills: {},
    statuses: {},
    marks: {},
    weather: {},
    elements: { elements: [], matrix: {}, values: {}, combine: {} },
    rules: { damageFormula: { balance: 1, stab: 1 }, combat: { damageReductionCap: 99 }, ...(formula ? { formula } : {}) },
    stats: {},
    assets: {},
    mechanisms: [],
    warnings: [],
    dataVersion: "t",
    dataUpdatedAt: "t",
  };
}

const skill = { id: "sk", category: "Physical", element: "Fire", power: 100 };

describe("formula evaluator (P1)", () => {
  it("evaluates the default formula chain", () => {
    const { value, vars } = evaluateFormula(DEFAULT_FORMULA, {
      power: 100,
      atk: 100,
      dfn: 100,
      typeMult: 1,
      stab: 1,
      stageMult: 1,
      traitMult: 1,
      weatherMult: 1,
      extraMult: 1,
      reduction: 1,
      hits: 1,
      balance: 1,
    });
    expect(vars.effectivePower).toBe(100);
    expect(vars.perHit).toBe(100);
    expect(value).toBe(100);
  });

  it("clamps and rounds with the closed operator set", () => {
    expect(evaluateFormula({ steps: [{ let: "x", expr: ["clamp", 150, 0, 99] }], output: "x" }, {}).value).toBe(99);
    expect(evaluateFormula({ steps: [{ let: "x", expr: ["floor", ["div", 7, 2]] }], output: "x" }, {}).value).toBe(3);
  });

  it("falls back to the default when the spec is missing or invalid", () => {
    expect(resolveFormula({}).output).toBe("damage");
    expect(resolveFormula({ formula: { output: "damage" } as unknown as FormulaSpec })).toBe(DEFAULT_FORMULA);
    expect(resolveFormula({ formula: DEFAULT_FORMULA })).toBe(DEFAULT_FORMULA);
  });

  it("drives computeDamage from the data spec (formula is editable)", () => {
    const base = makeBundle();
    const attacker = makeActive("sp", { hp: 500, maxHp: 500 });
    const defender = makeActive("sp", { hp: 500, maxHp: 500 });
    const d0 = computeDamage(base, sprite, sprite, attacker, defender, skill, {}).damage;

    const doubled: FormulaSpec = {
      steps: [...DEFAULT_FORMULA.steps, { let: "out", expr: ["mul", "damage", 2] }],
      output: "out",
    };
    const d1 = computeDamage(makeBundle(doubled), sprite, sprite, attacker, defender, skill, {}).damage;
    expect(d1).toBe(d0 * 2);
  });
});
