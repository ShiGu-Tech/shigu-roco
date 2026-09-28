/** 运行时状态的构造与深拷贝（对应 Python models.py 的 clone 语义）。 */

import type { ActiveSprite, BattleState, SideState, StatProfile, Weather } from "./types";

export function cloneProfile(p: StatProfile | undefined): StatProfile | undefined {
  if (!p) return undefined;
  return {
    level: p.level,
    nature: p.nature,
    training: p.training ? { ...p.training } : undefined,
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
  };
}

export function cloneSide(s: SideState): SideState {
  return {
    magic: s.magic,
    active: cloneActive(s.active),
    bench: s.bench.map(cloneActive),
    teamMarks: { ...s.teamMarks },
    switchLock: s.switchLock,
    seenEnemy: [...s.seenEnemy],
    wishChargesLeft: s.wishChargesLeft,
    wishCooldown: s.wishCooldown,
    leaderUsed: s.leaderUsed,
  };
}

export function cloneState(s: BattleState): BattleState {
  return {
    turn: s.turn,
    player: cloneSide(s.player),
    enemy: cloneSide(s.enemy),
    weather: s.weather ? ({ ...s.weather } as Weather) : null,
    seed: s.seed,
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
