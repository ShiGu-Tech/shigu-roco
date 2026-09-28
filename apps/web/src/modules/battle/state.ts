import type { ActiveSpriteState, BattleState, Catalog, CatalogSprite } from "./types";

export function activeFromSprite(sprite: CatalogSprite, energy = 10): ActiveSpriteState {
  const maxHp = Math.max(1, Number(sprite.race.hp ?? 1));
  return {
    spriteId: sprite.id,
    hp: maxHp,
    maxHp,
    energy,
    loadout: sprite.skills.slice(0, 4).map((s) => s.id),
    buffs: {},
    debuffs: {},
    marks: {},
    statuses: {},
  };
}

export function emptyActive(): ActiveSpriteState {
  return {
    spriteId: "",
    hp: 1,
    maxHp: 1,
    energy: 0,
    loadout: [],
    buffs: {},
    debuffs: {},
    marks: {},
    statuses: {},
  };
}

export function createInitialState(catalog: Catalog): BattleState {
  const first = catalog.sprites[0];
  const second = catalog.sprites[1] ?? catalog.sprites[0];
  const rules = catalog.rules as { initialMagic?: number; wishCharges?: number };
  const magic = Number(rules.initialMagic ?? 3);
  const wish = Number(rules.wishCharges ?? 2);
  return {
    turn: 1,
    weather: null,
    seed: 42,
    player: {
      magic,
      active: first ? activeFromSprite(first) : emptyActive(),
      bench: [],
      seenEnemy: [],
      wishChargesLeft: wish,
      wishCooldown: 0,
      leaderUsed: false,
    },
    enemy: {
      magic,
      active: second ? activeFromSprite(second) : emptyActive(),
      bench: [],
      seenEnemy: [],
      wishChargesLeft: wish,
      wishCooldown: 0,
      leaderUsed: false,
    },
  };
}
