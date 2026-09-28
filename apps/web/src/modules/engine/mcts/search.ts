/** MCTS 搜索：我方建树，对手用贝叶斯模型采样。对应 Python mcts/search.py。
 *
 * 算法路线不变：UCB1 + 截断启发式估值 + 对手 A/D/S 采样；
 * 新增：对手养成档位在 rollout 内按后验采样（隐藏信息）。
 */

import { getSprite } from "../data";
import { applyProfile } from "../stats";
import { cloneState } from "../state";
import { sampleTrainingProfile, profileToStatProfile } from "../opponent/training";
import { OpponentModel } from "../opponent/bayes";
import type { Rng } from "../rng";
import { Rng as RngClass } from "../rng";
import type { Simulator } from "../simulator/battle";
import type { Action, BattleState, Side, TrainingProfileDef } from "../types";
import { asDict, toNum } from "../types";

const PLAYER: Side = "player";
const ENEMY: Side = "enemy";

export interface MCTSConfig {
  maxIterations: number;
  timeLimitMs: number;
  explorationC: number;
  rolloutMaxTurns: number;
  seed: number;
}

export const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  maxIterations: 1000,
  timeLimitMs: 1500,
  explorationC: 1.414,
  rolloutMaxTurns: 12,
  seed: 42,
};

export interface TrainingContext {
  profiles: TrainingProfileDef[];
  counts: number[];
  alpha?: number[];
  spriteId: string;
}

interface Node {
  state: BattleState;
  parent: Node | null;
  action: Action | null;
  visits: number;
  value: number;
  children: Node[];
  untried: Action[];
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function makeNode(state: BattleState, action: Action | null = null): Node {
  return { state, parent: null, action, visits: 0, value: 0, children: [], untried: [] };
}

export interface RecommendAction {
  action: Partial<Action>;
  label: string;
  winRate: number;
  visits: number;
  score: number;
}

export interface RecommendOutput {
  actions: RecommendAction[];
  opponent: Record<string, number>;
  opponentTraining?: Record<string, number>;
  meta: {
    iterations: number;
    elapsedMs: number;
    searchedTurns: number;
    seed: number;
  };
}

export class MCTS {
  readonly sim: Simulator;
  readonly cfg: MCTSConfig;
  readonly rng: Rng;
  private training: TrainingContext | null = null;

  constructor(sim: Simulator, config?: Partial<MCTSConfig>) {
    this.sim = sim;
    this.cfg = { ...DEFAULT_MCTS_CONFIG, ...config };
    this.rng = new RngClass(this.cfg.seed);
  }

  // -------------------------------------------------------------- 对手采样
  private sampleOpponent(state: BattleState, model: OpponentModel): Action {
    const legal = this.sim.legalActions(state, ENEMY);
    if (!legal.length) return { kind: "defend" };
    const wanted = model.sampleClass(this.rng);
    let pool: Action[] = [];
    if (wanted === "A") pool = legal.filter((a) => this.sim.actionType(a) === "Attack");
    else if (wanted === "D") pool = legal.filter((a) => this.sim.actionType(a) === "Defense");
    else pool = legal.filter((a) => this.sim.actionType(a) === "Status");
    if (!pool.length) pool = legal;
    return this.rng.pick(pool);
  }

  /** 按养成后验采样一个档位并套到敌方对应精灵上（改动传入的 state 副本）。 */
  private applyEnemyTraining(st: BattleState): void {
    if (!this.training) return;
    const profile = sampleTrainingProfile(this.rng, this.training.profiles, this.training.counts, this.training.alpha);
    const statProfile = profileToStatProfile(profile);
    for (const sprite of [st.enemy.active, ...st.enemy.bench]) {
      if (sprite.spriteId !== this.training.spriteId) continue;
      applyProfile(this.sim.bundle.stats, getSprite(this.sim.bundle, sprite.spriteId), sprite, statProfile);
    }
  }

  // -------------------------------------------------------------- 估值
  private evaluate(state: BattleState): number {
    const term = this.sim.terminal(state);
    if (term.ended) return term.winner === PLAYER ? 1.0 : 0.0;
    const ev = asDict(this.sim.bundle.rules.mctsEval);
    const wMagic = toNum(ev.wMagic, 0.4);
    const wHp = toNum(ev.wHpRatio, 2.0);
    const wBench = toNum(ev.wBench, 0.2);

    const p = state.player;
    const e = state.enemy;
    const myHp = p.active.hp / Math.max(p.active.maxHp, 1);
    const enHp = e.active.hp / Math.max(e.active.maxHp, 1);
    const myBench = p.bench.filter((b) => b.hp > 0).length;
    const enBench = e.bench.filter((b) => b.hp > 0).length;
    const score = wMagic * (p.magic - e.magic) + wHp * (myHp - enHp) + wBench * (myBench - enBench);
    return sigmoid(score);
  }

  private rollout(state: BattleState, model: OpponentModel): number {
    let st = cloneState(state);
    this.applyEnemyTraining(st);
    let turns = 0;
    while (turns < this.cfg.rolloutMaxTurns) {
      const term = this.sim.terminal(st);
      if (term.ended) return term.winner === PLAYER ? 1.0 : 0.0;
      const pActions = this.sim.legalActions(st, PLAYER);
      if (!pActions.length) break;
      const eAction = this.sampleOpponent(st, model);
      st = this.sim.step(st, this.rng.pick(pActions), eAction, this.rng).state;
      turns += 1;
    }
    return this.evaluate(st);
  }

  // -------------------------------------------------------------- UCB
  private ucb(child: Node, parentVisits: number): number {
    if (child.visits === 0) return Number.POSITIVE_INFINITY;
    const exploit = child.value / child.visits;
    const explore = this.cfg.explorationC * Math.sqrt(Math.log(parentVisits + 1) / child.visits);
    return exploit + explore;
  }

  private select(node: Node): Node {
    let current = node;
    while (current.untried.length === 0 && current.children.length > 0) {
      let best = current.children[0];
      let bestScore = this.ucb(best, current.visits);
      for (const child of current.children.slice(1)) {
        const score = this.ucb(child, current.visits);
        if (score > bestScore) {
          best = child;
          bestScore = score;
        }
      }
      current = best;
    }
    return current;
  }

  private expand(node: Node, model: OpponentModel): Node {
    const action = node.untried.pop() as Action;
    const eAction = this.sampleOpponent(node.state, model);
    const result = this.sim.step(node.state, action, eAction, this.rng);
    const child = makeNode(result.state, action);
    child.parent = node;
    child.untried = this.sim.legalActions(child.state, PLAYER);
    node.children.push(child);
    return child;
  }

  search(rootState: BattleState, model?: OpponentModel, training?: TrainingContext | null): RecommendOutput {
    const opponent = model ?? new OpponentModel();
    this.training = training ?? null;

    const root = makeNode(cloneState(rootState));
    root.untried = this.sim.legalActions(root.state, PLAYER);

    const start = Date.now();
    let iterations = 0;
    while (iterations < this.cfg.maxIterations) {
      if (Date.now() - start >= this.cfg.timeLimitMs) break;
      iterations += 1;
      let node = this.select(root);
      const term = this.sim.terminal(node.state);
      if (!term.ended && node.untried.length) node = this.expand(node, opponent);
      const value = this.sim.terminal(node.state).ended ? this.evaluate(node.state) : this.rollout(node.state, opponent);
      let cursor: Node | null = node;
      while (cursor) {
        cursor.visits += 1;
        cursor.value += value;
        cursor = cursor.parent;
      }
    }

    const elapsedMs = Date.now() - start;
    const actions: RecommendAction[] = root.children.map((child) => {
      const wr = child.visits ? child.value / child.visits : 0;
      const action = child.action ?? { kind: "defend" };
      return {
        action: { ...action },
        label: action.label ?? "",
        winRate: Math.round(wr * 10000) / 10000,
        visits: child.visits,
        score: Math.round(wr * 10000) / 10000,
      };
    });
    actions.sort((a, b) => (b.winRate - a.winRate) || (b.visits - a.visits));

    const out: RecommendOutput = {
      actions,
      opponent: opponent.probabilities(),
      meta: {
        iterations,
        elapsedMs,
        searchedTurns: this.cfg.rolloutMaxTurns,
        seed: this.cfg.seed,
      },
    };
    if (training) {
      const probs = training.counts.map((c, i) => c + (training.alpha?.[i] ?? training.profiles[i]?.prior ?? 1));
      const sum = probs.reduce((s, v) => s + v, 0) || 1;
      out.opponentTraining = Object.fromEntries(training.profiles.map((p, i) => [p.id, probs[i] / sum]));
    }
    return out;
  }
}
