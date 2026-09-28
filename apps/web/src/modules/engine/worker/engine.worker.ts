/** 引擎 Web Worker：在浏览器内跑 MCTS / 结算，避免阻塞主线程。
 *
 * 数据由主线程经 /api/engine/bundle 取回后 init 注入；引擎为同构纯 TS。
 */

import * as handlers from "../api/handlers";
import { buildBundle } from "../data";
import type { DataBundle, Dict, RawDataFiles } from "../types";

type InitMessage = { id: number; type: "init"; raw: RawDataFiles };
type RequestMessage = { id: number; type: "request"; route: string; body?: Dict };
type Incoming = InitMessage | RequestMessage;

const scope = globalThis as unknown as {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

let bundle: DataBundle | null = null;

function dispatch(current: DataBundle, route: string, body: Dict): unknown {
  switch (route) {
    case "health":
      return handlers.health(current);
    case "catalog":
      return handlers.catalog(current);
    case "recommend":
      return handlers.recommend(current, body as unknown as handlers.RecommendBody);
    case "simulate/turn":
      return handlers.simulateTurn(current, body);
    case "simulate/forced-switch":
      return handlers.forcedSwitch(current, body);
    case "simulate/leader":
      return handlers.leader(current, body);
    case "opponent/observe":
      return handlers.observe(current, body);
    default:
      throw new Error(`未知路由: ${route}`);
  }
}

scope.onmessage = (event: MessageEvent) => {
  const msg = event.data as Incoming;
  try {
    if (msg.type === "init") {
      bundle = buildBundle(msg.raw);
      scope.postMessage({ id: msg.id, ok: true, result: { dataVersion: bundle.dataVersion } });
      return;
    }
    if (!bundle) throw new Error("worker 未初始化");
    scope.postMessage({ id: msg.id, ok: true, result: dispatch(bundle, msg.route, msg.body ?? {}) });
  } catch (err) {
    scope.postMessage({ id: msg.id, ok: false, error: (err as Error).message });
  }
};
