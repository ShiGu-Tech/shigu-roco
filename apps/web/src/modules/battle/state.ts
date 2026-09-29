import { maxHpFromRace } from "@/modules/engine/stats";
import type { StatsData } from "@/modules/engine/types";
import type { ActiveSpriteState, BattleState, Catalog, CatalogSprite, StatProfileState } from "./types";

export function activeFromSprite(
  sprite: CatalogSprite,
  stats?: StatsData,
  energy = 10,
  profile?: StatProfileState,
): ActiveSpriteState {
  const maxHp = stats ? maxHpFromRace(stats, sprite.race, profile) : Math.max(1, Number(sprite.race.hp ?? 1));
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
    profile,
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
  const rules = catalog.rules as { initialMagic?: number; magic?: { initialPerSide?: number }; wishCharges?: number };
  const magic = Number(rules.initialMagic ?? rules.magic?.initialPerSide ?? 4);
  const wish = Number(rules.wishCharges ?? 2);
  return {
    turn: 1,
    weather: null,
    seed: 42,
    player: {
      magic,
      active: first ? activeFromSprite(first, catalog.stats) : emptyActive(),
      bench: [],
      seenEnemy: [],
      wishChargesLeft: wish,
      wishCooldown: 0,
      leaderUsed: false,
    },
    enemy: {
      magic,
      active: second ? activeFromSprite(second, catalog.stats) : emptyActive(),
      bench: [],
      seenEnemy: [],
      wishChargesLeft: wish,
      wishCooldown: 0,
      leaderUsed: false,
    },
  };
}
