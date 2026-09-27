/** 统一引擎客户端：所有请求经 /api/engine/* 反代到本地 Python 引擎。 */

export async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/engine${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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
