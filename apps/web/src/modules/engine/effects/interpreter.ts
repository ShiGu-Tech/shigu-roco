/** 效果 DSL 解释器：把 ops 应用到运行时状态。对应 Python effects/interpreter.py。
 *
 * 术语：self = 施放者（技能）或印记携带者；enemy = 目标方。
 * 未知 op / when 记 warning 并安全跳过（数据先行、代码后补）。
 */

import { getMark } from "../data";
import type { Rng } from "../rng";
import type { ActiveSprite, BattleEvent, BattleState, Dict, Side } from "../types";
import { asDict, toNum, toStr } from "../types";
import { getSprite } from "../data";

const MAX_STACK_FALLBACK = 999;

export class EffectContext {
  state: BattleState;
  bundle: import("../types").DataBundle;
  rng: Rng;
  casterSide: Side;
  targetSide: Side;
  defenderAction: string | null;
  firstStrike: boolean;
  extraDamageMult: number;
  events: BattleEvent[];

  constructor(init: {
    state: BattleState;
    bundle: import("../types").DataBundle;
    rng: Rng;
    casterSide: Side;
    targetSide: Side;
    defenderAction?: string | null;
    firstStrike?: boolean;
    extraDamageMult?: number;
    events?: BattleEvent[];
  }) {
    this.state = init.state;
    this.bundle = init.bundle;
    this.rng = init.rng;
    this.casterSide = init.casterSide;
    this.targetSide = init.targetSide;
    this.defenderAction = init.defenderAction ?? null;
    this.firstStrike = init.firstStrike ?? false;
    this.extraDamageMult = init.extraDamageMult ?? 1.0;
    this.events = init.events ?? [];
  }

  active(who: Side): ActiveSprite {
    return (who === "player" ? this.state.player : this.state.enemy).active;
  }
}

function log(ctx: EffectContext, type: string, side: Side | null, text: string, data: Dict = {}): void {
  ctx.events.push({ type, side, text, data });
}

export function evalWhen(when: Dict, ctx: EffectContext): boolean {
  const tag = toStr(when.tag);
  if (tag === "action") return ctx.defenderAction === toStr(when.value);
  if (tag === "firstStrike") return ctx.firstStrike === Boolean(when.value);
  if (tag === "hpBelow") {
    const who = toStr(when.target, "enemy");
    const active = ctx.active(who === "enemy" ? ctx.targetSide : ctx.casterSide);
    return active.hp <= toNum(when.ratio, 0) * Math.max(active.maxHp, 1);
  }
  if (tag === "hasMark") {
    const who = toStr(when.target, "enemy");
    const active = ctx.active(who === "enemy" ? ctx.targetSide : ctx.casterSide);
    return toNum(active.marks[toStr(when.mark)], 0) >= toNum(when.stack, 1);
  }
  if (tag === "element") {
    const who = toStr(when.target, "enemy");
    const side = who === "enemy" ? ctx.targetSide : ctx.casterSide;
    const sprite = getSprite(ctx.bundle, ctx.active(side).spriteId);
    return ((sprite.elements as string[] | undefined) ?? []).includes(toStr(when.value));
  }
  if (tag === "weather") {
    return Boolean(ctx.state.weather && ctx.state.weather.id === toStr(when.value));
  }
  if (tag === "chance") return ctx.rng.next() < toNum(when.probability, 0);
  if (tag === "all") return (when.when as Dict[] | undefined)?.every((w) => evalWhen(w, ctx)) ?? true;
  if (tag === "any") return (when.when as Dict[] | undefined)?.some((w) => evalWhen(w, ctx)) ?? false;
  if (tag === "not") return !evalWhen(asDict(when.when), ctx);
  return false;
}

function stackCap(bundle: import("../types").DataBundle, markId: string): number {
  return toNum(getMark(bundle, markId).maxStack, MAX_STACK_FALLBACK);
}

function targetActive(op: Dict, ctx: EffectContext): [ActiveSprite, Side] {
  const who = toStr(op.target, "enemy");
  const side: Side = who === "enemy" ? ctx.targetSide : ctx.casterSide;
  return [ctx.active(side), side];
}

export function applyOps(ops: Dict[] | undefined, ctx: EffectContext): BattleEvent[] {
  for (const op of ops ?? []) applyOp(op, ctx);
  return ctx.events;
}

export function applyOp(op: Dict, ctx: EffectContext): void {
  const kind = toStr(op.kind);
  if (kind === "conditional") {
    if (evalWhen(asDict(op.when), ctx)) applyOps(op.then as Dict[], ctx);
    return;
  }
  switch (kind) {
    case "damage":
      opDamage(op, ctx);
      return;
    case "heal":
      opHeal(op, ctx);
      return;
    case "stat_mod":
      opStatMod(op, ctx);
      return;
    case "add_mark":
      opAddMark(op, ctx, toNum(op.stack, 1));
      return;
    case "remove_mark":
      opRemoveMark(op, ctx);
      return;
    case "mark_delta":
      opAddMark(op, ctx, toNum(op.delta, 0));
      return;
    case "energy":
      opEnergy(op, ctx);
      return;
    case "magic":
      opMagic(op, ctx);
      return;
    case "status":
      opStatus(op, ctx);
      return;
    case "weather":
      opWeather(op, ctx);
      return;
    case "priority":
      return; // 由模拟器读取 skill.priority
    case "damage_mult":
      if (!op.when || evalWhen(asDict(op.when), ctx)) ctx.extraDamageMult *= toNum(op.factor, 1.0);
      return;
    case "heal_from_damage":
      return; // 预留
    default:
      log(ctx, "unknown_op", null, `未实现的 op: ${kind}`, { op });
  }
}

function opDamage(op: Dict, ctx: EffectContext): void {
  const [target, side] = targetActive(op, ctx);
  if (target.hp <= 0) return;
  const basis = toStr(op.basis, "flat");
  let damage: number;
  if (basis === "stack") damage = toNum(op.ratio, 0) * toNum(target.marks[toStr(op.mark)], 0);
  else if (basis === "maxHp") damage = toNum(op.ratio, 0) * target.maxHp;
  else if (basis === "currentHp") damage = toNum(op.ratio, 0) * target.hp;
  else damage = toNum(op.ratio, toNum(op.value, 0));
  damage = Math.floor(damage);
  target.hp = Math.max(0, target.hp - damage);
  log(ctx, "damage", side, `${target.spriteId} 受到 ${damage} 点伤害`, { value: damage });
}

function opHeal(op: Dict, ctx: EffectContext): void {
  const [target, side] = targetActive(op, ctx);
  const basis = toStr(op.basis, "flat");
  let amount: number;
  if (basis === "maxHp") amount = toNum(op.ratio, 0) * target.maxHp;
  else if (basis === "currentHp") amount = toNum(op.ratio, 0) * target.hp;
  else amount = toNum(op.ratio, toNum(op.value, 0));
  amount = Math.floor(amount);
  target.hp = Math.min(target.maxHp, target.hp + amount);
  log(ctx, "heal", side, `${target.spriteId} 回复 ${amount} 点生命`, { value: amount });
}

function opStatMod(op: Dict, ctx: EffectContext): void {
  const [target, side] = targetActive(op, ctx);
  const stat = toStr(op.stat);
  let value = toNum(op.value, 0);
  const mode = toStr(op.mode, "percent");
  if (mode === "percent" && Math.abs(value) > 1) value = value / 100;
  const bucket = value >= 0 ? target.buffs : target.debuffs;
  bucket[stat] = toNum(bucket[stat], 0) + value;
  const sign = value >= 0 ? "+" : "";
  log(ctx, "stat_mod", side, `${target.spriteId} ${stat} ${sign}${(value * 100).toFixed(0)}%`);
}

function opAddMark(op: Dict, ctx: EffectContext, delta: number): void {
  const [target, side] = targetActive(op, ctx);
  const markId = toStr(op.mark);
  if (!markId) return;
  const cap = stackCap(ctx.bundle, markId);
  const current = toNum(target.marks[markId], 0);
  const next = Math.max(0, Math.min(cap, current + delta));
  if (next === 0) delete target.marks[markId];
  else target.marks[markId] = next;
  const sign = delta >= 0 ? "+" : "";
  log(ctx, "mark", side, `${target.spriteId} 印记 ${markId} ${sign}${delta}`, {
    mark: markId,
    stack: toNum(target.marks[markId], 0),
  });
}

function opRemoveMark(op: Dict, ctx: EffectContext): void {
  const [target, side] = targetActive(op, ctx);
  const markId = toStr(op.mark);
  const stack = op.stack;
  if (stack === "all" || stack === undefined) {
    delete target.marks[markId];
  } else {
    const remaining = toNum(target.marks[markId], 0) - toNum(stack, 0);
    if (remaining > 0) target.marks[markId] = remaining;
    else delete target.marks[markId];
  }
  log(ctx, "mark", side, `${target.spriteId} 移除印记 ${markId}`);
}

function opEnergy(op: Dict, ctx: EffectContext): void {
  const [target, side] = targetActive(op, ctx);
  const delta = toNum(op.delta, 0);
  target.energy = Math.max(0, target.energy + delta);
  log(ctx, "energy", side, `${target.spriteId} 能量 ${delta >= 0 ? "+" : ""}${delta}`);
}

function opMagic(op: Dict, ctx: EffectContext): void {
  const who = toStr(op.target, "enemy");
  const side: Side = who === "enemy" ? ctx.targetSide : ctx.casterSide;
  const state = side === "player" ? ctx.state.player : ctx.state.enemy;
  const delta = toNum(op.delta, 0);
  state.magic = Math.max(0, state.magic + delta);
  log(ctx, "magic", side, `魔力 ${delta >= 0 ? "+" : ""}${delta}`, { value: delta });
}

function opStatus(op: Dict, ctx: EffectContext): void {
  const [target, side] = targetActive(op, ctx);
  const status = toStr(op.status);
  if (op.chance !== undefined && op.chance !== null) {
    if (ctx.rng.next() >= toNum(op.chance, 0)) return;
  }
  target.statuses[status] = Math.floor(toNum(op.turns, 1));
  log(ctx, "status", side, `${target.spriteId} 进入状态 ${status}`);
}

function opWeather(op: Dict, ctx: EffectContext): void {
  const weatherId = toStr(op.weather);
  if (!weatherId) return;
  const def = ctx.bundle.weather[weatherId] ?? {};
  const turns = Math.floor(toNum(op.turns, toNum(def.defaultTurns, 5)));
  ctx.state.weather = { id: weatherId, turnsLeft: turns };
  log(ctx, "weather", null, `天气变为 ${weatherId}，持续 ${turns} 回合`);
}
