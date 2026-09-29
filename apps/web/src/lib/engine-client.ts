/** 统一引擎客户端：所有请求经 /api/engine/*（Next Route Handler 内置 TS 引擎）。 */

export async function engineFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = 30000, ...rest } = init ?? {};
  const res = await fetch(`/api/engine${path}`, {
    ...rest,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as { error?: string; detail?: string; hint?: string } | null;
    const message = b?.error ?? b?.detail ?? `引擎请求失败（${res.status}）`;
    throw new Error(b?.hint ? `${message} · ${b.hint}` : message);
  }
  return body as T;
}

/** 带重试的请求：用于首屏加载，容忍「引擎比前端晚几百毫秒就绪」。 */
export async function engineFetchWithRetry<T>(
  path: string,
  { attempts = 6, delayMs = 700 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await engineFetch<T>(path, { timeoutMs: 8000 });
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("引擎连接失败");
}
