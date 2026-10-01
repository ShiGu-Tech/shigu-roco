import type {
  ActiveSpriteState,
  BattleState,
  Catalog,
  CatalogSkill,
  CatalogSprite,
  EngineAction,
  SideState,
} from "@/modules/battle/types";
import { activeFromSprite, emptyActive } from "@/modules/battle/state";
import { profileFromSetup, type TeamEntry } from "@/modules/battle/pet";
import type { CostMod } from "@/modules/engine/types";

export {
  DEFAULT_LEVEL,
  DEFAULT_STARS,
  MAX_INVEST,
  MAX_TALENT,
  emptySetup,
  neutralSetup,
  profileFromSetup,
  type PetSetup,
  type TalentMap,
  type TeamEntry,
} from "@/modules/battle/pet";

export interface ActionOption {
  action: EngineAction;
  label: string;
  kindLabel: string;
  element?: string;
  elementZh?: string;
  category?: string;
  cost?: number;
  power?: number;
  priority?: number;
}

export function actionKey(a: { kind?: string; skillId?: string; benchId?: string }): string {
  return `${a.kind ?? ""}:${a.skillId ?? a.benchId ?? ""}`;
}

export function energyRule(catalog: Catalog): { recover: number; max: number } {
  const e = (catalog.rules as { energy?: { recover?: number; max?: number } }).energy;
  return { recover: Number(e?.recover ?? 5), max: Number(e?.max ?? 10) };
}

export function elementZh(catalog: Catalog, key: string): string {
  return catalog.elements.find((el) => el.name === key)?.nameZh ?? key;
}

export function elementColor(catalog: Catalog, key: string): string | undefined {
  return catalog.elements.find((el) => el.name === key)?.color;
}

export function spriteOf(catalog: Catalog, id: string): CatalogSprite | undefined {
  return catalog.sprites.find((s) => s.id === id);
}

export function skillById(catalog: Catalog, id: string): CatalogSkill | undefined {
  const all = (catalog.allSkills ?? []).find((s) => s.id === id);
  if (all) return all;
  for (const sp of catalog.sprites) {
    const found = sp.skills.find((s) => s.id === id);
    if (found) return found;
  }
  return undefined;
}

/** 本精灵默认技能池（自己的已学技能）。 */
export function ownSkills(catalog: Catalog, spriteId: string): CatalogSkill[] {
  return spriteOf(catalog, spriteId)?.skills ?? [];
}

/** 命中某技能的所有能耗修正条目（与引擎 `effectiveCost` 的筛选口径一致）。 */
export function costModBreakdown(sk: CatalogSkill, active: ActiveSpriteState): CostMod[] {
  const mods = active.costMods ?? [];
  const element = sk.element ?? "";
  const attack = sk.category === "Physical" || sk.category === "Magic";
  return mods.filter((m) => {
    if (m.scope === "skill" && m.skillId !== sk.id) return false;
    if (m.scope === "attack" && !attack) return false;
    if (m.scope === "defense" && sk.actionType !== "Defense") return false;
    if (m.elements?.length && !m.elements.includes(element)) return false;
    if (m.excludeElements?.length && m.excludeElements.includes(element)) return false;
    return true;
  });
}

/** 有效能耗（点技能前预览）：与引擎 `engine/cost.ts#effectiveCost` 同口径（floor + clamp ≥ 0）。 */
export function previewSkillCost(sk: CatalogSkill, active: ActiveSpriteState): number {
  let multiplied = sk.cost;
  let added = 0;
  for (const m of costModBreakdown(sk, active)) {
    if (typeof m.multiply === "number") multiplied *= m.multiply;
    added += m.delta ?? 0;
  }
  added += active.skillMods?.[sk.id]?.cost ?? 0;
  return Math.max(0, Math.floor(multiplied + added));
}

export function optionFromSkill(catalog: Catalog, sk: CatalogSkill): ActionOption {
  return {
    action: { kind: "skill", skillId: sk.id, label: sk.name },
    label: sk.name,
    kindLabel: sk.category,
    element: sk.element,
    elementZh: elementZh(catalog, sk.element),
    category: sk.category,
    cost: sk.cost,
    power: sk.power,
    priority: sk.priority,
  };
}

export function deriveActions(side: SideState, catalog: Catalog): ActionOption[] {
  const sprite = spriteOf(catalog, side.active.spriteId);
  const out: ActionOption[] = [];
  if (!sprite) return out;

  // 阵亡后：只能换人（与引擎 legal_actions 一致）
  if (side.active.hp <= 0) {
    for (const b of side.bench) {
      if (b.hp <= 0) continue;
      const bs = spriteOf(catalog, b.spriteId);
      out.push({
        action: { kind: "switch", benchId: b.spriteId, label: `换 ${bs?.name ?? b.spriteId}` },
        label: `换 ${bs?.name ?? b.spriteId}`,
        kindLabel: "阵亡换人",
      });
    }
    return out;
  }

  const ids = side.active.loadout.length ? side.active.loadout : sprite.skills.slice(0, 4).map((s) => s.id);
  for (const id of ids) {
    const sk = skillById(catalog, id);
    if (!sk || previewSkillCost(sk, side.active) > side.active.energy) continue;
    out.push(optionFromSkill(catalog, sk));
  }

  for (const b of side.bench) {
    if (b.hp <= 0 || b.spriteId === side.active.spriteId) continue;
    const bs = spriteOf(catalog, b.spriteId);
    out.push({
      action: { kind: "switch", benchId: b.spriteId, label: `换 ${bs?.name ?? b.spriteId}` },
      label: `换 ${bs?.name ?? b.spriteId}`,
      kindLabel: "换人",
    });
  }

  if (side.wishChargesLeft > 0 && side.wishCooldown === 0) {
    out.push({
      action: { kind: "wish", label: "愿力冲击" },
      label: "愿力冲击",
      kindLabel: `剩余 ${side.wishChargesLeft} 次 · 背包技能`,
    });
  }

  const { recover, max } = energyRule(catalog);
  if (side.active.energy < max) {
    out.push({ action: { kind: "energy", label: "聚能" }, label: "聚能", kindLabel: `+${recover} 能量` });
  }

  return out;
}

function toEntry(entry: string | TeamEntry): TeamEntry {
  return typeof entry === "string" ? { spriteId: entry } : entry;
}

function sideFromTeam(catalog: Catalog, raw: (string | TeamEntry)[], magic: number, wish: number): SideState {
  const rules = catalog.rules as { energy?: { initial?: number } };
  const initialEnergy = Number(rules.energy?.initial ?? 10);
  const actives: ActiveSpriteState[] = [];
  for (const entry of raw.map(toEntry)) {
    const sprite = spriteOf(catalog, entry.spriteId);
    if (!sprite) continue;
    const active = activeFromSprite(sprite, catalog.stats, initialEnergy, profileFromSetup(entry.setup));
    if (entry.setup) active.loadout = entry.setup.skills.filter(Boolean).slice(0, 4);
    actives.push(active);
  }
  return {
    magic,
    active: actives[0] ?? emptyActive(),
    bench: actives.slice(1),
    seenEnemy: [],
    wishChargesLeft: wish,
    wishCooldown: 0,
    leaderUsed: false,
  };
}

export function buildState(
  catalog: Catalog,
  playerTeam: (string | TeamEntry)[],
  enemyTeam: (string | TeamEntry)[],
): BattleState {
  const rules = catalog.rules as { initialMagic?: number; magic?: { initialPerSide?: number }; wishCharges?: number };
  const magic = Number(rules.initialMagic ?? rules.magic?.initialPerSide ?? 4);
  const wish = Number(rules.wishCharges ?? 2);
  return {
    turn: 1,
    weather: null,
    seed: 42,
    player: sideFromTeam(catalog, playerTeam, magic, wish),
    enemy: sideFromTeam(catalog, enemyTeam, magic, wish),
  };
}

/** 把双方对调，用于以「敌方视角」跑 MCTS，得到敌方按钮推荐度。 */
export function swapState(s: BattleState): BattleState {
  return { ...s, player: s.enemy, enemy: s.player };
}
