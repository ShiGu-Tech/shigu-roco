/** 伤害公式求值器（引擎工作台 P1）。
 *
 * 公式是可版本化的数据（`rules.json.formula`）：由**封闭算子**组成的纯数值表达式 AST，
 * 不是脚本、无 `eval`、无副作用。`computeDamage` / `calc.damageOf` 共用本文件，保证执行与预览同口径。
 */

/** 表达式：数字常量 | 变量名 | `[op, ...args]`。算子封闭：add/sub/mul/div/floor/ceil/round/min/max/pow/clamp。 */
export type Expr = number | string | Expr[];

export interface FormulaStep {
  let: string;
  expr: Expr;
}

export interface FormulaSpec {
  kind?: string;
  /** 允许的输入变量名（供校验/编辑器展示）。 */
  inputs?: string[];
  /** 顺序求值：每步把一个表达式绑定到 `let` 变量。 */
  steps: FormulaStep[];
  /** 输出变量名。 */
  output: string;
  /** 需要暴露到 breakdown 的变量名。 */
  breakdown?: string[];
}

const UNARY = new Set(["floor", "ceil", "round"]);

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 求值单个表达式（纯函数）。 */
export function evalExpr(expr: Expr, vars: Record<string, number>): number {
  if (typeof expr === "number") return expr;
  if (typeof expr === "string") return asNumber(vars[expr]);
  if (!Array.isArray(expr) || expr.length === 0) return 0;
  const [op, ...args] = expr;
  const name = String(op);
  if (UNARY.has(name)) {
    const v = evalExpr(args[0] as Expr, vars);
    return name === "floor" ? Math.floor(v) : name === "ceil" ? Math.ceil(v) : Math.round(v);
  }
  if (name === "clamp") return Math.min(Math.max(evalExpr(args[0] as Expr, vars), evalExpr(args[1] as Expr, vars)), evalExpr(args[2] as Expr, vars));
  if (name === "sub") return evalExpr(args[0] as Expr, vars) - evalExpr(args[1] as Expr, vars);
  if (name === "div") return evalExpr(args[0] as Expr, vars) / evalExpr(args[1] as Expr, vars);
  if (name === "pow") return Math.pow(evalExpr(args[0] as Expr, vars), evalExpr(args[1] as Expr, vars));
  if (name === "add") return args.reduce<number>((sum, a) => sum + evalExpr(a as Expr, vars), 0);
  if (name === "mul") return args.reduce<number>((product, a) => product * evalExpr(a as Expr, vars), 1);
  if (name === "min") return Math.min(...args.map((a) => evalExpr(a as Expr, vars)));
  if (name === "max") return Math.max(...args.map((a) => evalExpr(a as Expr, vars)));
  return 0;
}

/** 按步求值，返回输出值与全部中间变量。 */
export function evaluateFormula(spec: FormulaSpec, inputs: Record<string, number>): { value: number; vars: Record<string, number> } {
  const vars: Record<string, number> = { ...inputs };
  for (const step of spec.steps ?? []) vars[step.let] = evalExpr(step.expr, vars);
  return { value: asNumber(vars[spec.output]), vars };
}

/** 默认公式（与 `data/rules.json.formula` 一致；bundle 缺 `formula` 时兜底）。 */
export const DEFAULT_FORMULA: FormulaSpec = {
  kind: "expr-v1",
  inputs: ["power", "atk", "dfn", "typeMult", "stab", "stageMult", "traitMult", "weatherMult", "extraMult", "reduction", "hits", "balance"],
  steps: [
    { let: "effectivePower", expr: ["mul", "power", "typeMult", "stab", "stageMult", "traitMult", "weatherMult", "extraMult"] },
    { let: "perHit", expr: ["floor", ["div", ["mul", "atk", "effectivePower", "balance"], "dfn"]] },
    { let: "damage", expr: ["floor", ["mul", "perHit", "reduction", "hits"]] },
  ],
  output: "damage",
  breakdown: ["atk", "dfn", "effectivePower", "perHit", "stageMult", "stab", "typeMult", "traitMult", "weatherMult", "extraMult", "reduction", "hits"],
};

/** 从 bundle.rules 解析公式 spec；缺失或非法时回退 `DEFAULT_FORMULA`。 */
export function resolveFormula(rules: Record<string, unknown> | undefined): FormulaSpec {
  const spec = rules?.formula as FormulaSpec | undefined;
  return spec && Array.isArray(spec.steps) && typeof spec.output === "string" ? spec : DEFAULT_FORMULA;
}
