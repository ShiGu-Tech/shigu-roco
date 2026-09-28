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
    training: p.training ? numDict(p.training) : undefined,
  };
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
    profile: parseProfile(raw.profile),
  };
}

function parseSide(raw: Dict) {
  return {
    magic: toNum(raw.magic, 0),
    active: parseActive(asDict(raw.active)),
    bench: toArray<Dict>(raw.bench).map(parseActive),
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
    engineVersion: "0.2.0",
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
    element: toStr(sk.element),
    category: toStr(sk.category),
    actionType: toStr(sk.actionType),
    power: toNum(sk.power, 0),
    cost: toNum(sk.cost, 0),
    priority: toNum(sk.priority, 0),
    icon: icons[id] ?? null,
  };
}

export function catalog(bundle: DataBundle): Dict {
  const spriteAssets = asDict(asDict(bundle.assets).sprites);
  const skillIcons = asDict(asDict(bundle.assets).skills);
  const sprites = Object.entries(bundle.sprites).map(([sid, sp]) => {
    const skills = toArray<string>(sp.skillList)
      .map((skillId) => bundle.skills[skillId])
      .filter((sk): sk is Dict => Boolean(sk))
      .map((sk) => skillBrief(bundle, sk, skillIcons));
    const asset = asDict(spriteAssets[sid]);
    return {
      id: sid,
      no: toNum(sp.no, 0),
      name: toStr(sp.name),
      nameZh: toStr(sp.nameZh),
      stage: toNum(sp.stage, 0),
      elements: toArray<string>(sp.elements),
      race: asDict(sp.race),
      trait: asDict(sp.trait),
      leaderAllowed: sp.leaderAllowed !== false,
      image: asset.image ?? null,
      head: asset.head ?? null,
      skills,
    };
  });
  const allSkills = Object.values(bundle.skills).map((sk) => skillBrief(bundle, sk, skillIcons));
  const rules = asDict(bundle.rules);
  const energy = asDict(rules.energy);
  const stats = bundle.stats ?? {};
  return {
    dataVersion: bundle.dataVersion,
    dataUpdatedAt: bundle.dataUpdatedAt,
    elements: toArray(asDict(bundle.elements).elements),
    sprites,
    allSkills,
    marks: Object.values(bundle.marks).map((m) => ({ id: toStr(m.id), name: toStr(m.name), maxStack: toNum(m.maxStack, 0) })),
    weather: Object.values(bundle.weather).map((w) => ({ id: toStr(w.id), name: toStr(w.name) })),
    rules: {
      initialMagic: toNum(asDict(rules.magic).initialPerSide, 4),
      magicMax: toNum(asDict(rules.magic).maxPerSide, 4),
      wishCharges: toNum(asDict(rules.wish).maxUses, 2),
      wishCooldown: toNum(asDict(rules.wish).cooldown, 1),
      leaderOnce: asDict(rules.leader).once !== false,
      energy: { recover: toNum(energy.recover, 5), max: toNum(energy.max, 10), initial: toNum(energy.initial, 10) },
    },
    stats: {
      natures: stats.natures ?? [],
      training: stats.training ?? {},
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

/** Worker 用：全量数据 + 数据版本。 */
export function bundlePayload(bundle: DataBundle): Dict {
  return {
    dataVersion: bundle.dataVersion,
    dataUpdatedAt: bundle.dataUpdatedAt,
    warnings: bundle.warnings,
    sprites: { sprites: Object.values(bundle.sprites), version: bundle.dataVersion, updatedAt: bundle.dataUpdatedAt },
    skills: { skills: Object.values(bundle.skills) },
    marks: { marks: Object.values(bundle.marks) },
    weather: { weather: Object.values(bundle.weather) },
    elements: bundle.elements,
    rules: bundle.rules,
    stats: bundle.stats,
    assets: bundle.assets,
  };
}

// 供测试 / 外部直接构造
export { getMark, getSkill, getSprite, getWeatherDef };
