/** 引擎 API 逻辑（与旧 FastAPI 契约一致）。 */

import { counts, getMark, getSkill, getSprite, getWeatherDef } from "../data";
import { schemaPayload } from "../mechanisms/vocabulary";
import { MCTS, DEFAULT_MCTS_CONFIG, type RecommendOutput, type TrainingContext } from "../mcts/search";
import { compileIssues, NODE_REGISTRY } from "./compile-check";
import { OpponentModel } from "../opponent/bayes";
import {
  actionCountsFor,
  normalizeLibrary,
  trainingCountsFor,
} from "../opponent/library";
import { maxHpLikelihood, profileOptions, trainingProbabilities } from "../opponent/training";
import { Rng } from "../rng";
import { Simulator } from "../simulator/battle";
import { ENGINE_VERSION } from "../version";
import type { Action, ActiveSprite, BattleEvent, BattleState, DataBundle, Dict, Side, StatProfile } from "../types";
import { asDict, toArray, toNum, toStr } from "../types";

// ---------------------------------------------------------------- 解析

function numDict(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(asDict(v))) out[k] = toNum(val, 0);
  return out;
}

function intDict(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(asDict(v))) out[k] = Math.floor(toNum(val, 0));
  return out;
}

function parseProfile(raw: unknown): StatProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Dict;
  return {
    level: p.level === undefined ? undefined : toNum(p.level, 0),
    nature: p.nature === undefined || p.nature === null ? (p.nature as null | undefined) : toStr(p.nature),
    iv: p.iv ? intDict(p.iv) : undefined,
    stars: p.stars === undefined ? undefined : toNum(p.stars, 0),
  };
}

function parseSkillOverrides(raw: unknown): ActiveSprite["skillOverrides"] {
  const out: Record<string, { original: string; expires: number }> = {};
  for (const [skillId, value] of Object.entries(asDict(raw))) {
    const entry = asDict(value);
    out[skillId] = { original: toStr(entry.original), expires: toNum(entry.expires, 0) };
  }
  return Object.keys(out).length ? out : undefined;
}

function parseSkillMods(raw: unknown): ActiveSprite["skillMods"] {
  const out: NonNullable<ActiveSprite["skillMods"]> = {};
  for (const [skillId, value] of Object.entries(asDict(raw))) {
    const m = asDict(value);
    const mod: { power?: number; cost?: number; hits?: number; priority?: number } = {};
    if (m.power !== undefined) mod.power = toNum(m.power, 0);
    if (m.cost !== undefined) mod.cost = toNum(m.cost, 0);
    if (m.hits !== undefined) mod.hits = toNum(m.hits, 0);
    if (m.priority !== undefined) mod.priority = toNum(m.priority, 0);
    out[skillId] = mod;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseCostMods(raw: unknown): ActiveSprite["costMods"] {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return undefined;
  return list.map((item) => {
    const m = asDict(item);
    const source = toStr(m.source, "system") as NonNullable<ActiveSprite["costMods"]>[number]["source"];
    return {
      key: toStr(m.key),
      source,
      sourceId: m.sourceId === undefined ? undefined : toStr(m.sourceId),
      sourceSide: m.sourceSide === undefined ? undefined : (toStr(m.sourceSide) as "player" | "enemy"),
      sourceSpriteId: m.sourceSpriteId === undefined ? undefined : toStr(m.sourceSpriteId),
      scope: toStr(m.scope, "skill") as NonNullable<ActiveSprite["costMods"]>[number]["scope"],
      skillId: m.skillId === undefined ? undefined : toStr(m.skillId),
      elements: m.elements === undefined ? undefined : toArray<string>(m.elements),
      excludeElements: m.excludeElements === undefined ? undefined : toArray<string>(m.excludeElements),
      delta: m.delta === undefined ? undefined : toNum(m.delta, 0),
      multiply: m.multiply === undefined ? undefined : toNum(m.multiply, 1),
      mode: m.mode === undefined ? undefined : (toStr(m.mode) as "add" | "set"),
      duration: toStr(m.duration, "permanent") as NonNullable<ActiveSprite["costMods"]>[number]["duration"],
      turnsLeft: m.turnsLeft === undefined ? undefined : toNum(m.turnsLeft, 0),
      oncePerTurn: m.oncePerTurn === undefined ? undefined : Boolean(m.oncePerTurn),
      dispellable: Boolean(m.dispellable),
      hidden: Boolean(m.hidden),
    };
  });
}

function parseActive(raw: Dict): ActiveSprite {
  const counters = numDict(raw.counters);
  return {
    spriteId: toStr(raw.spriteId),
    hp: toNum(raw.hp, 0),
    maxHp: toNum(raw.maxHp, 1),
    energy: toNum(raw.energy, 0),
    loadout: toArray<string>(raw.loadout),
    buffs: numDict(raw.buffs),
    debuffs: numDict(raw.debuffs),
    marks: intDict(raw.marks),
    statuses: intDict(raw.statuses),
    cooldowns: intDict(raw.cooldowns),
    faintHandled: Boolean(raw.faintHandled),
    profile: parseProfile(raw.profile),
    skillOverrides: parseSkillOverrides(raw.skillOverrides),
    counters: Object.keys(counters).length ? counters : undefined,
    skillMods: parseSkillMods(raw.skillMods),
    costMods: parseCostMods(raw.costMods),
    entered: raw.entered === undefined ? undefined : Boolean(raw.entered),
  };
}

function parseSide(raw: Dict) {
  return {
    magic: toNum(raw.magic, 0),
    active: parseActive(asDict(raw.active)),
    bench: toArray<Dict>(raw.bench).map(parseActive),
    teamMarks: intDict(raw.teamMarks),
    switchLock: Math.max(0, Math.floor(toNum(raw.switchLock, 0))),
    seenEnemy: toArray<string>(raw.seenEnemy),
    wishChargesLeft: toNum(raw.wishChargesLeft, 0),
    wishCooldown: toNum(raw.wishCooldown, 0),
    leaderUsed: Boolean(raw.leaderUsed),
    pendingEffects: Array.isArray(raw.pendingEffects) ? (raw.pendingEffects as import("../mechanisms/types").PendingEffect[]) : undefined,
  };
}

export function parseState(raw: Dict): BattleState {
  const weather = raw.weather as Dict | null | undefined;
  return {
    turn: toNum(raw.turn, 1),
    player: parseSide(asDict(raw.player)),
    enemy: parseSide(asDict(raw.enemy)),
    weather: weather ? { id: toStr(weather.id), turnsLeft: toNum(weather.turnsLeft, 0) } : null,
    seed: toNum(raw.seed, 0),
    onceFired: raw.onceFired ? Object.fromEntries(Object.entries(asDict(raw.onceFired)).map(([k, v]) => [k, Boolean(v)])) : undefined,
  };
}

export function parseAction(raw: Dict): Action {
  return {
    kind: (toStr(raw.kind, "defend") as Action["kind"]),
    skillId: raw.skillId === undefined ? undefined : toStr(raw.skillId),
    benchId: raw.benchId === undefined ? undefined : toStr(raw.benchId),
    label: raw.label === undefined ? undefined : toStr(raw.label),
  };
}

function eventsToDict(events: BattleEvent[]): Dict[] {
  return events.map((e) => ({ type: e.type, side: e.side, text: e.text, data: e.data }));
}

// ---------------------------------------------------------------- 端点

export function health(bundle: DataBundle): Dict {
  return {
    status: "ok",
    engineVersion: ENGINE_VERSION,
    dataVersion: bundle.dataVersion,
    dataUpdatedAt: bundle.dataUpdatedAt,
    counts: counts(bundle),
    warnings: bundle.warnings.slice(0, 50),
  };
}

function skillBrief(bundle: DataBundle, sk: Dict, icons: Dict): Dict {
  const id = toStr(sk.id);
  return {
    id,
    name: toStr(sk.skillName, id),
    nameZh: toStr(sk.nameZh, toStr(sk.skillName, id)),
    element: toStr(sk.element),
    elementZh: toStr(sk.elementZh),
    category: toStr(sk.category),
    categoryZh: toStr(sk.categoryZh, toStr(sk.category)),
    actionType: toStr(sk.actionType),
    actionTypeZh: toStr(sk.actionTypeZh, toStr(sk.actionType)),
    power: toNum(sk.power, 0),
    cost: toNum(sk.cost, 0),
    priority: toNum(sk.priority, 0),
    icon: toStr(sk.icon) || icons[id] || null,
    categoryIcon: toStr(sk.categoryIcon) || null,
    description: toStr(sk.description, toStr(sk.rawText)),
  };
}

function toSkillId(value: unknown): string {
  const id = typeof value === "number" ? String(value) : toStr(value);
  return id.startsWith("sk-") ? id : `sk-${id}`;
}

/** 技能学习来源：优先归一化字段，缺失则回退到 sourceData.skillIds（兼容旧版注册快照）。 */
function skillSourcesOf(sprite: Dict): Dict {
  const explicit = asDict(sprite.skillSources);
  const out: Dict = {};
  const sourceData = asDict(sprite.sourceData);
  for (const entry of toArray<Dict>(sourceData.skillIds)) {
    const src = toStr(entry.src);
    if (src && src !== "passive") out[toSkillId(entry.id)] = src;
  }
  for (const [id, src] of Object.entries(explicit)) {
    if (id !== "sk-" && src) out[id.startsWith("sk-") ? id : toSkillId(id)] = src;
  }
  return Object.keys(out).length ? out : explicit;
}

export function catalog(bundle: DataBundle): Dict {
  const skillIcons = asDict(asDict(bundle.assets).skills);
  const sprites = Object.entries(bundle.sprites).map(([sid, sp]) => {
    const skills = toArray<string>(sp.skillList)
      .map((skillId) => bundle.skills[skillId])
      .filter((sk): sk is Dict => Boolean(sk))
       .map((sk) => ({ ...skillBrief(bundle, sk, skillIcons), icon: `/images/catalog/skills/${toStr(sk.id)}.webp` }));
    return {
      id: sid,
      no: toNum(sp.no, 0),
      name: toStr(sp.name),
      nameZh: toStr(sp.nameZh),
      form: toStr(sp.form) || null,
      formId: toNum(sp.formId, 1),
      stage: toNum(sp.stage, 0),
      elements: toArray<string>(sp.elements),
      race: asDict(sp.race),
      trait: asDict(sp.trait),
      skillSources: skillSourcesOf(sp),
      leaderAllowed: sp.leaderAllowed !== false,
       image: `/images/catalog/sprites/${sid}.webp`,
       head: `/images/catalog/heads/${sid}.webp`,
      skills,
    };
  });
  const allSkills = Object.values(bundle.skills).map((sk) => {
    const brief = skillBrief(bundle, sk, skillIcons);
    return { ...brief, icon: `/images/catalog/skills/${toStr(sk.id)}.webp` };
  });
  const rules = asDict(bundle.rules);
  const energy = asDict(rules.energy);
  const stats = bundle.stats ?? {};
  return {
    dataVersion: bundle.dataVersion,
    dataUpdatedAt: bundle.dataUpdatedAt,
    elements: toArray(asDict(bundle.elements).elements),
    bloodlines: toArray(asDict(bundle.elements).bloodlines),
    sprites,
    allSkills,
    statuses: Object.values(bundle.statuses).map((s) => ({ id: toStr(s.id), name: toStr(s.nameZh, toStr(s.name)), nameZh: toStr(s.nameZh, toStr(s.name)), description: toStr(s.description, toStr(s.rawText)), maxStack: toNum(s.maxStack, 0) })),
    marks: Object.values(bundle.marks).map((m) => ({ id: toStr(m.id), name: toStr(m.nameZh, toStr(m.name)), nameZh: toStr(m.nameZh, toStr(m.name)), description: toStr(m.description, toStr(m.rawText)), maxStack: toNum(m.maxStack, 0) })),
    weather: Object.values(bundle.weather).map((w) => ({ id: toStr(w.id), name: toStr(w.nameZh, toStr(w.name)), nameZh: toStr(w.nameZh, toStr(w.name)), description: toStr(w.description, toStr(w.rawText)) })),
    rules: {
      initialMagic: toNum(asDict(rules.magic).initialPerSide, 4),
      magicMax: toNum(asDict(rules.magic).maxPerSide, 4),
      wishCharges: toNum(asDict(rules.wish).maxUses, 2),
      wishCooldown: toNum(asDict(rules.wish).cooldown, 1),
      leaderOnce: asDict(rules.leader).once !== false,
      energy: { recover: toNum(energy.recover, 5), max: toNum(energy.max, 10), initial: toNum(energy.initial, 10) },
    },
    stats: {
      level: toNum(asDict(stats.level).default, 60),
      panels: stats.panels ?? {},
      individual: stats.individual ?? {},
      natureScaling: stats.natureScaling ?? {},
      starBonus: stats.starBonus ?? {},
      natures: stats.natures ?? [],
      trainingProfiles: stats.trainingProfiles ?? { options: [] },
      talentRecommend: stats.talentRecommend ?? {},
    },
    warnings: bundle.warnings.slice(0, 50),
  };
}

export interface RecommendBody {
  state: Dict;
  options?: Dict;
}

export function recommend(bundle: DataBundle, body: RecommendBody): RecommendOutput {
  const state = parseState(asDict(body.state));
  const options = asDict(body.options);
  const sim = new Simulator(bundle);

  const library = normalizeLibrary(options.opponentLibrary);
  const enemyId = state.enemy.active.spriteId;

  const countsFromLibrary = actionCountsFor(library, enemyId);
  const countsFromOptions = ["A", "D", "S"].map((c) => toNum(asDict(options.opponentModel)[c], 0));
  const counts = countsFromLibrary.some((c) => c > 0) ? countsFromLibrary : countsFromOptions;
  const opponent = new OpponentModel([1, 1, 1], counts);

  const profiles = profileOptions(bundle);
  const training: TrainingContext = {
    profiles,
    counts: trainingCountsFor(library, enemyId, profiles),
    spriteId: enemyId,
  };

  const cfg = {
    maxIterations: toNum(options.maxIterations, DEFAULT_MCTS_CONFIG.maxIterations),
    timeLimitMs: toNum(options.timeLimitMs, DEFAULT_MCTS_CONFIG.timeLimitMs),
    explorationC: toNum(options.explorationC, DEFAULT_MCTS_CONFIG.explorationC),
    rolloutMaxTurns: toNum(options.rolloutMaxTurns, DEFAULT_MCTS_CONFIG.rolloutMaxTurns),
    seed: toNum(options.seed, state.seed || DEFAULT_MCTS_CONFIG.seed),
  };

  const searcher = new MCTS(sim, cfg);
  return searcher.search(state, opponent, training);
}

export function simulateTurn(bundle: DataBundle, body: Dict): Dict {
  const sim = new Simulator(bundle);
  const state = parseState(asDict(body.state));
  const rng = new Rng(toNum(body.seed, state.seed));
  const result = sim.step(state, parseAction(asDict(body.playerAction)), parseAction(asDict(body.enemyAction)), rng);
  const term = sim.terminal(result.state);
  return {
    state: result.state,
    log: eventsToDict(result.events),
    phaseLogs: result.phaseLogs,
    terminal: { ended: term.ended, winner: term.winner, reason: term.reason },
  };
}

export function legalActions(bundle: DataBundle, body: Dict): Dict {
  const sim = new Simulator(bundle);
  const state = parseState(asDict(body.state));
  const side = toStr(body.side, "player") as Side;
  return { side, actions: sim.legalActions(state, side) };
}

export function forcedSwitch(bundle: DataBundle, body: Dict): Dict {
  const sim = new Simulator(bundle);
  const state = parseState(asDict(body.state));
  const side = toStr(body.side, "player") as Side;
  const events = sim.forcedSwitch(state, side, toStr(body.benchId));
  return { state, log: eventsToDict(events) };
}

export function leader(bundle: DataBundle, body: Dict): Dict {
  const sim = new Simulator(bundle);
  const state = parseState(asDict(body.state));
  const side = toStr(body.side, "player") as Side;
  const events = sim.applyLeader(state, side);
  return { state, log: eventsToDict(events) };
}

export function observe(bundle: DataBundle, body: Dict): Dict {
  const model = OpponentModel.fromDict(asDict(body.prior) as Record<string, number>);
  model.observe(toStr(body.actionClass));
  const out: Dict = { ok: true, posterior: model.probabilities() };

  const enemyId = toStr(body.enemyActiveId);
  if (enemyId && body.maxHp !== undefined) {
    const profiles = profileOptions(bundle);
    const counts = trainingCountsFor(normalizeLibrary(body.library), enemyId, profiles);
    const likelihoods = maxHpLikelihood(bundle, enemyId, toNum(body.maxHp, 0), profiles);
    const posterior = trainingProbabilities(profiles, counts.map((c, i) => c + likelihoods[i]));
    out.trainingPosterior = Object.fromEntries(profiles.map((p, i) => [p.id, posterior[i]]));
  }
  return out;
}

/** 剥离仅用于图鉴追溯的原始页面快照 sourceData，得到精简运行时条目。 */
function stripSource(item: Dict): Dict {
  if (!item || typeof item !== "object" || item.sourceData === undefined) return item;
  const copy = { ...item };
  delete copy.sourceData;
  return copy;
}

/** 旧注册快照把技能来源藏在 sourceData 里；精简前固化为 skillSources 字段，供 catalog 使用。 */
function leanSprite(sprite: Dict): Dict {
  const sources = skillSourcesOf(sprite);
  const enriched = Object.keys(sources).length ? { ...sprite, skillSources: sources } : sprite;
  return stripSource(enriched);
}

/** Worker / 静态包用：全量数据 + 数据版本（不含 sourceData，含 mechanisms）。 */
export function bundlePayload(bundle: DataBundle): Dict {
  return {
    engineVersion: ENGINE_VERSION,
    dataVersion: bundle.dataVersion,
    dataUpdatedAt: bundle.dataUpdatedAt,
    warnings: bundle.warnings,
    sprites: { sprites: Object.values(bundle.sprites).map(leanSprite), version: bundle.dataVersion, updatedAt: bundle.dataUpdatedAt },
    skills: { skills: Object.values(bundle.skills).map(stripSource) },
    statuses: { statuses: Object.values(bundle.statuses).map(stripSource) },
    marks: { marks: Object.values(bundle.marks).map(stripSource) },
    weather: { weather: Object.values(bundle.weather).map(stripSource) },
    elements: bundle.elements,
    rules: bundle.rules,
    stats: bundle.stats,
    assets: bundle.assets,
    mechanisms: bundle.mechanisms ?? [],
  };
}

/** trait 机制的 ownerId 有两态（精灵基 id `sp-1` / 带形态 `sp-219-1`），图鉴键恒为 `sp-<no>-<formId>`。 */
function findSpriteEntry(bundle: DataBundle, id: string): Dict {
  const exact = bundle.sprites[id];
  if (exact) return asDict(exact);
  const form1 = bundle.sprites[`${id}-1`];
  if (form1) return asDict(form1);
  const prefix = Object.entries(bundle.sprites).find(([key]) => key.startsWith(`${id}-`));
  return prefix ? asDict(prefix[1]) : {};
}

/** 机制归属显示名：skill→技能名、trait→精灵名·特性名、status/mark/weather→图鉴名。 */
function ownerNameOf(bundle: DataBundle, ownerType: unknown, ownerId: unknown): string {
  const type = toStr(ownerType);
  const id = toStr(ownerId);
  switch (type) {
    case "skill": {
      const skill = asDict(bundle.skills[id]);
      return toStr(skill.skillName, toStr(skill.nameZh, id));
    }
    case "trait": {
      const sprite = findSpriteEntry(bundle, id);
      const spriteName = toStr(sprite.name, id);
      const traitName = toStr(asDict(sprite.trait).name, "");
      return traitName ? `${spriteName} · ${traitName}` : spriteName;
    }
    case "status":
      return toStr(asDict(bundle.statuses[id]).name, toStr(asDict(bundle.statuses[id]).nameZh, id));
    case "mark":
      return toStr(asDict(bundle.marks[id]).name, toStr(asDict(bundle.marks[id]).nameZh, id));
    case "weather":
      return toStr(asDict(bundle.weather[id]).name, toStr(asDict(bundle.weather[id]).nameZh, id));
    default:
      return id;
  }
}

function hasUnsupported(effects: unknown): boolean {
  for (const effect of toArray<Dict>(effects)) {
    if (effect.type === "unsupported") return true;
    for (const field of ["effects", "effectsPerLayer", "effectsOnConsume"]) {
      if (hasUnsupported(effect[field])) return true;
    }
  }
  return false;
}

function countEffects(effects: unknown): number {
  let total = 0;
  for (const effect of toArray<Dict>(effects)) {
    total += 1;
    for (const field of ["effects", "effectsPerLayer", "effectsOnConsume"]) {
      total += countEffects(effect[field]);
    }
  }
  return total;
}

/** 工作台节点词汇（trigger / 效果命令 / 条件 / 动态取值 / 节点目录），UI 不硬编码。 */
export function workbenchSchema(): Dict {
  return {
    ...(schemaPayload() as unknown as Dict),
    nodes: NODE_REGISTRY.catalog() as unknown as Dict[],
  };
}

/** 工作台 · 校验：编译单条机制定义（DSL 草稿）→ 程序 → `validateProgram`。 */
export function workbenchValidate(body: Dict): Dict {
  const issues = compileIssues(body.def);
  return {
    errors: issues.filter((issue) => issue.level === "error"),
    warnings: issues.filter((issue) => issue.level !== "error"),
  };
}

/** 工作台机制列表：摘要 + 完整定义（含归属名解析），供只读投影与筛选。 */
export function workbenchMechanisms(bundle: DataBundle): Dict {
  const items = (bundle.mechanisms ?? []) as Dict[];
  return {
    dataVersion: bundle.dataVersion,
    mechanisms: items.map((definition) => ({
      id: toStr(definition.id),
      ownerType: toStr(definition.ownerType),
      ownerId: toStr(definition.ownerId),
      ownerName: ownerNameOf(bundle, definition.ownerType, definition.ownerId),
      trigger: toStr(definition.trigger),
      effectCount: countEffects(definition.effects),
      unsupported: hasUnsupported(definition.effects),
      registered: toStr(definition.id).startsWith("registered:"),
      def: definition,
    })),
  };
}

/** 调试沙盒 · 合法行动：一次返回双方在该状态下的全部合法行动（供调试台行动选择）。 */
export function debugLegal(bundle: DataBundle, body: Dict): Dict {
  const sim = new Simulator(bundle);
  const state = parseState(asDict(body.state));
  return { player: sim.legalActions(state, "player"), enemy: sim.legalActions(state, "enemy") };
}

/** 调试沙盒 · 单步：真实结算一回合（≠ 回放快照），返回新状态 + 事件（含 trigger / 伤害 breakdown）+ 下一步双方合法行动。 */
export function debugStep(bundle: DataBundle, body: Dict): Dict {
  const sim = new Simulator(bundle);
  const state = parseState(asDict(body.state));
  const rng = new Rng(toNum(body.seed, state.seed));
  const result = sim.step(state, parseAction(asDict(body.playerAction)), parseAction(asDict(body.enemyAction)), rng);
  const term = sim.terminal(result.state);
  return {
    state: result.state,
    log: eventsToDict(result.events),
    phaseLogs: result.phaseLogs,
    terminal: { ended: term.ended, winner: term.winner, reason: term.reason },
    legal: { player: sim.legalActions(result.state, "player"), enemy: sim.legalActions(result.state, "enemy") },
  };
}

// 供测试 / 外部直接构造
export { getMark, getSkill, getSprite, getWeatherDef };
