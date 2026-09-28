/** 前端 Worker 封装：懒加载 + 首次 init（拉取全量数据）+ 请求/回退。 */

import type { Dict } from "../types";

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (typeof window === "undefined") throw new Error("Worker 仅在浏览器可用");
  if (!worker) {
    worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error ?? "worker 错误"));
    };
  }
  return worker;
}

function send<T>(type: string, payload: Dict): Promise<T> {
  const w = getWorker();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, type, ...payload });
  });
}

export function initWorker(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const res = await fetch("/api/engine/bundle", { cache: "no-store" });
    if (!res.ok) throw new Error(`加载数据失败（${res.status}）`);
    const raw = (await res.json()) as Dict;
    await send("init", { raw });
  })().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

export async function workerRequest<T>(route: string, body: Dict = {}): Promise<T> {
  await initWorker();
  return send<T>("request", { route, body });
}

export function workerReady(): boolean {
  return Boolean(worker) && Boolean(initPromise);
}
