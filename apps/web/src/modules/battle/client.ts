import { engineFetch } from "@/lib/engine-client";

import type { BattleState, Catalog, RecommendResult } from "./types";

export function getCatalog() {
  return engineFetch<Catalog>("/catalog");
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
}

export function recommend(state: BattleState, options: RecommendOptions) {
  return engineFetch<RecommendResult>("/recommend", {
    method: "POST",
    body: JSON.stringify({ state, options }),
  });
}
