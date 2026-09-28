import { engineFetch, engineFetchWithRetry } from "@/lib/engine-client";
import { workerRequest } from "@/modules/engine/worker/client";

import type { BattleState, Catalog, EngineAction, RecommendResult, SimulateTurnResult } from "./types";

export function getCatalog() {
  return engineFetchWithRetry<Catalog>("/catalog");
}

export function getHealth() {
  return engineFetch<{ status: string; dataVersion: string; dataUpdatedAt: string; counts: Record<string, number>; warnings: string[] }>("/health");
}

export interface RecommendOptions {
  maxIterations: number;
  timeLimitMs: number;
  explorationC: number;
  rolloutMaxTurns: number;
  seed: number;
  opponentModel?: Record<string, number>;
  opponentLibrary?: Record<string, unknown>;
}

/** 优先走浏览器 Worker（不阻塞主线程），失败回退服务端。 */
export async function recommend(state: BattleState, options: RecommendOptions) {
  try {
    return await workerRequest<RecommendResult>("recommend", { state, options });
  } catch {
    return engineFetch<RecommendResult>("/recommend", {
      method: "POST",
      body: JSON.stringify({ state, options }),
    });
  }
}

export async function simulateTurn(
  state: BattleState,
  playerAction: EngineAction,
  enemyAction: EngineAction,
  seed = state.seed,
) {
  try {
    return await workerRequest<SimulateTurnResult>("simulate/turn", { state, playerAction, enemyAction, seed });
  } catch {
    return engineFetch<SimulateTurnResult>("/simulate/turn", {
      method: "POST",
      body: JSON.stringify({ state, playerAction, enemyAction, seed }),
    });
  }
}

export function forcedSwitch(state: BattleState, side: "player" | "enemy", benchId: string) {
  return engineFetch<{ state: BattleState; log: SimulateTurnResult["log"] }>("/simulate/forced-switch", {
    method: "POST",
    body: JSON.stringify({ state, side, benchId }),
  });
}

export function requestLeader(state: BattleState, side: "player" | "enemy") {
  return engineFetch<{ state: BattleState; log: SimulateTurnResult["log"] }>("/simulate/leader", {
    method: "POST",
    body: JSON.stringify({ state, side }),
  });
}
