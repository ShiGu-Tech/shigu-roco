import { engineFetch, engineFetchWithRetry } from "@/lib/engine-client";
import { workerRequest } from "@/modules/engine/worker/client";

import type { BattleState, Catalog, EngineAction, RecommendResult, SimulateTurnResult } from "./types";

/** 图鉴与引擎共用同一份数据：Worker 优先，失败回退服务端。 */
export async function getCatalog() {
  try {
    return await workerRequest<Catalog>("catalog");
  } catch {
    return engineFetchWithRetry<Catalog>("/catalog");
  }
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

type StepResult = { state: BattleState; log: SimulateTurnResult["log"] };

export async function forcedSwitch(state: BattleState, side: "player" | "enemy", benchId: string) {
  try {
    return await workerRequest<StepResult>("simulate/forced-switch", { state, side, benchId });
  } catch {
    return engineFetch<StepResult>("/simulate/forced-switch", {
      method: "POST",
      body: JSON.stringify({ state, side, benchId }),
    });
  }
}

export async function requestLeader(state: BattleState, side: "player" | "enemy") {
  try {
    return await workerRequest<StepResult>("simulate/leader", { state, side });
  } catch {
    return engineFetch<StepResult>("/simulate/leader", {
      method: "POST",
      body: JSON.stringify({ state, side }),
    });
  }
}
