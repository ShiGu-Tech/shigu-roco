/** TS 引擎公共出口（同构，不含 Node fs；服务端 loader 见 data-node.ts / server.ts）。 */

export * from "./types";
export * from "./state";
export * from "./rng";
export * from "./stats";
export * from "./calc";
export { buildBundle, typeMultiplier, bundleTypeMultiplier, DataError } from "./data";
export { Simulator } from "./simulator/battle";
export { clearMarksOnSwitch } from "./simulator/marks";
export { MCTS, DEFAULT_MCTS_CONFIG } from "./mcts/search";
export type { MCTSConfig, TrainingContext, RecommendOutput, RecommendAction } from "./mcts/search";
export { OpponentModel } from "./opponent/bayes";
export * from "./opponent/library";
export * from "./opponent/training";
export * as handlers from "./api/handlers";
export * from "./mechanisms";
