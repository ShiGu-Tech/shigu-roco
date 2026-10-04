/** 运行时状态的构造与深拷贝（对应 Python models.py 的 clone 语义）。 */

import type { ActiveSprite, BattleState, SideState, StatProfile, Weather } from "./types";

export function cloneProfile(p: StatProfile | undefined): StatProfile | undefined {
  if (!p) return undefined;
  return {
    level: p.level,
    nature: p.nature,
    iv: p.iv ? { ...p.iv } : undefined,
    stars: p.stars,
    bloodline: p.bloodline,
    ball: p.ball,
  };
}

export function cloneActive(a: ActiveSprite): ActiveSprite {
  return {
    spriteId: a.spriteId,
    hp: a.hp,
    maxHp: a.maxHp,
    energy: a.energy,
    loadout: [...a.loadout],
    buffs: { ...a.buffs },
    debuffs: { ...a.debuffs },
    marks: { ...a.marks },
    statuses: { ...a.statuses },
    cooldowns: a.cooldowns ? { ...a.cooldowns } : undefined,
    faintHandled: a.faintHandled,
    profile: cloneProfile(a.profile),
    skillOverrides: a.skillOverrides
      ? Object.fromEntries(Object.entries(a.skillOverrides).map(([k, v]) => [k, { ...v }]))
      : undefined,
    counters: a.counters ? { ...a.counters } : undefined,
    reviveDue: a.reviveDue,
    reviveAs: a.reviveAs,
    skillMods: a.skillMods ? Object.fromEntries(Object.entries(a.skillMods).map(([k, v]) => [k, { ...v }])) : undefined,
    costMods: a.costMods ? a.costMods.map((m) => ({ ...m, elements: m.elements ? [...m.elements] : undefined, excludeElements: m.excludeElements ? [...m.excludeElements] : undefined })) : undefined,
    entered: a.entered,
    actedSinceEntry: a.actedSinceEntry,
    pendingSkill: a.pendingSkill ? { ...a.pendingSkill } : undefined,
    element: a.element ? [...a.element] : undefined,
    carryElements: a.carryElements ? [...a.carryElements] : undefined,
    bloodline: a.bloodline,
    bloodlineElement: a.bloodlineElement,
    ball: a.ball,
    ruleOverrides: a.ruleOverrides ? { ...a.ruleOverrides } : undefined,
    disguise: a.disguise,
    summonedBy: a.summonedBy,
    inheritedFrom: a.inheritedFrom ? [...a.inheritedFrom] : undefined,
  };
}

/** 记录一次临时技能改动，供到期 / 用后还原。expires：-1 永久、0 用后还原、>0 绝对回合。 */
export function recordSkillOverride(active: ActiveSprite, tempSkillId: string, original: string, expires: number, cost?: number): void {
  active.skillOverrides ??= {};
  active.skillOverrides[tempSkillId] = cost === undefined ? { original, expires } : { original, expires, cost };
}

/** 把临时技能还原为原技能（original 为空则移除）。 */
export function revertSkillOverride(active: ActiveSprite, tempSkillId: string): boolean {
  const override = active.skillOverrides?.[tempSkillId];
  if (!override) return false;
  active.loadout = override.original
    ? active.loadout.map((skillId) => (skillId === tempSkillId ? override.original : skillId))
    : active.loadout.filter((skillId) => skillId !== tempSkillId);
  delete active.skillOverrides![tempSkillId];
  return true;
}

/** 回合结束：还原已到期的临时技能（expires > 0 且 <= turn）。 */
export function expireSkillOverrides(active: ActiveSprite, turn: number): string[] {
  if (!active.skillOverrides) return [];
  const expired: string[] = [];
  for (const [tempSkillId, override] of Object.entries(active.skillOverrides)) {
    if (override.expires > 0 && override.expires <= turn) expired.push(tempSkillId);
  }
  for (const tempSkillId of expired) revertSkillOverride(active, tempSkillId);
  return expired;
}

export function cloneSide(s: SideState): SideState {
  return {
    magic: s.magic,
    active: cloneActive(s.active),
    bench: s.bench.map(cloneActive),
    teamMarks: { ...s.teamMarks },
    dedications: s.dedications ? s.dedications.map((d) => ({ ...d })) : undefined,
    switchLock: s.switchLock,
    seenEnemy: [...s.seenEnemy],
    wishChargesLeft: s.wishChargesLeft,
    wishCooldown: s.wishCooldown,
    leaderUsed: s.leaderUsed,
    magicChoice: s.magicChoice,
    magicUsed: s.magicUsed,
    magicActive: s.magicActive ? { ...s.magicActive } : undefined,
    counters: s.counters ? { ...s.counters } : undefined,
    lastTurn: s.lastTurn ? { ...s.lastTurn } : undefined,
    forcedSwitch: s.forcedSwitch,
    pendingEntry: s.pendingEntry ? s.pendingEntry.map((effect) => ({ ...effect })) : undefined,
    pendingEffects: s.pendingEffects ? s.pendingEffects.map((p) => ({ ...p, effects: p.effects.map((effect) => ({ ...effect })) })) : undefined,
    switchedThisTurn: s.switchedThisTurn,
    lastHit: s.lastHit ? { ...s.lastHit } : undefined,
  };
}

export function cloneState(s: BattleState): BattleState {
  return {
    turn: s.turn,
    player: cloneSide(s.player),
    enemy: cloneSide(s.enemy),
    weather: s.weather ? ({ ...s.weather } as Weather) : null,
    seed: s.seed,
    // oncePerTurn 触发记录随克隆保留（战斗中途克隆 / MCTS 快照不得重置门）。
    onceFired: s.onceFired ? { ...s.onceFired } : undefined,
    dayOfWeek: s.dayOfWeek,
  };
}

export function alive(a: ActiveSprite): boolean {
  return a.hp > 0;
}

export function allSprites(s: SideState): ActiveSprite[] {
  return [s.active, ...s.bench];
}

export function makeActive(
  spriteId: string,
  opts: Partial<Pick<ActiveSprite, "hp" | "maxHp" | "energy">> & { profile?: StatProfile } = {},
): ActiveSprite {
  const maxHp = opts.maxHp ?? opts.hp ?? 1;
  return {
    spriteId,
    hp: opts.hp ?? maxHp,
    maxHp,
    energy: opts.energy ?? 0,
    loadout: [],
    buffs: {},
    debuffs: {},
    marks: {},
    statuses: {},
    faintHandled: false,
    profile: opts.profile,
    entered: false,
  };
}

export function makeSide(active: ActiveSprite, opts: Partial<Omit<SideState, "active">> = {}): SideState {
  return {
    magic: opts.magic ?? 4,
    active,
    bench: opts.bench ?? [],
    teamMarks: opts.teamMarks ?? {},
    switchLock: opts.switchLock ?? 0,
    seenEnemy: opts.seenEnemy ?? [],
    wishChargesLeft: opts.wishChargesLeft ?? 0,
    wishCooldown: opts.wishCooldown ?? 0,
    leaderUsed: opts.leaderUsed ?? false,
    magicChoice: opts.magicChoice,
    magicUsed: opts.magicUsed,
    magicActive: opts.magicActive,
  };
}

export function makeState(player: SideState, enemy: SideState, opts: Partial<BattleState> = {}): BattleState {
  return {
    turn: opts.turn ?? 1,
    player,
    enemy,
    weather: opts.weather ?? null,
    seed: opts.seed ?? 0,
  };
}
