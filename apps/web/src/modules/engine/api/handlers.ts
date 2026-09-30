/** 引擎 API 逻辑（与旧 FastAPI 契约一致）。 */

import { counts, getMark, getSkill, getSprite, getWeatherDef } from "../data";
import { MCTS, DEFAULT_MCTS_CONFIG, type RecommendOutput, type TrainingContext } from "../mcts/search";
import { OpponentModel } from "../opponent/bayes";
import {
  actionCountsFor,
  normalizeLibrary,
  trainingCountsFor,
} from "../opponent/library";
import { maxHpLikelihood, profileOptions, trainingProbabilities } from "../opponent/training";
import { Rng } from "../rng";
import { Simulator } from "../simulator/battle";
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

function parseActive(raw: Dict): ActiveSprite {
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
    engineVersion: "0.5.0",
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
    sprites,
    allSkills,
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
      natures: stats.natures ?? [],
      trainingProfiles: stats.trainingProfiles ?? { options: [] },
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
    dataVersion: bundle.dataVersion,
    dataUpdatedAt: bundle.dataUpdatedAt,
    warnings: bundle.warnings,
    sprites: { sprites: Object.values(bundle.sprites).map(leanSprite), version: bundle.dataVersion, updatedAt: bundle.dataUpdatedAt },
    skills: { skills: Object.values(bundle.skills).map(stripSource) },
    marks: { marks: Object.values(bundle.marks).map(stripSource) },
    weather: { weather: Object.values(bundle.weather).map(stripSource) },
    elements: bundle.elements,
    rules: bundle.rules,
    stats: bundle.stats,
    assets: bundle.assets,
    mechanisms: bundle.mechanisms ?? [],
  };
}

// 供测试 / 外部直接构造
export { getMark, getSkill, getSprite, getWeatherDef };
