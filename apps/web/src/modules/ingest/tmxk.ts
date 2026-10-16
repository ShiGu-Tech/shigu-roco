/**
 * tmxk 能力平台客户端（**服务端专用**）。
 *
 * roco 不直连 GPU 服务：识别经 tmxk 能力平台（`vision:ocr` / `voice:transcribe`）调用，
 * 平台侧持有上游地址与令牌。此处只做「换票 + 调能力」。
 *
 * 配置（服务器 `.env`，不入仓）：`TMXK_SITE_BASE_URL` / `TMXK_APP_KEY` / `TMXK_APP_SECRET`。
 * 未配置 → 调用方返回 503（降级为手工录入），不静默打空请求。
 *
 * 能力契约见 tmxk-site 的《视觉与语音能力-v0.1》。
 */

const TOKEN_SKEW_MS = 30_000;

export function tmxkConfigured(): boolean {
  return Boolean(baseUrl() && appKey() && appSecret());
}

function baseUrl(): string {
  return (process.env.TMXK_SITE_BASE_URL ?? "").replace(/\/+$/, "");
}
function appKey(): string {
  return process.env.TMXK_APP_KEY ?? "";
}
function appSecret(): string {
  return process.env.TMXK_APP_SECRET ?? "";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function appToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > Date.now()) return cachedToken.value;
  const response = await fetch(`${baseUrl()}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: appKey(), client_secret: appSecret() }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`换票失败（${response.status}）`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("换票响应缺少 access_token");
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (Number(payload.expires_in ?? 3600) || 3600) * 1000,
  };
  return cachedToken.value;
}

async function callCapability<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const token = await appToken();
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`能力调用失败（${response.status}）：${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/** 截图 / 拍照 → 文字行。 */
export async function tmxkVisionOcr(image: string, hint?: string): Promise<string> {
  const out = await callCapability<{ text?: string; blocks?: { text?: string }[] }>(
    "/api/vision/ocr",
    { image, hint },
    45_000,
  );
  if (typeof out.text === "string" && out.text.trim()) return out.text;
  return (out.blocks ?? []).map((block) => block.text ?? "").join("\n");
}

/** 语音 → 文字（首次调用上游要加载模型，超时放宽）。 */
export async function tmxkVoiceTranscribe(audio: string, mime: string, diarize = false): Promise<string> {
  const out = await callCapability<{ text?: string }>(
    "/api/voice/transcribe",
    { audio, mime, diarize },
    90_000,
  );
  return out.text ?? "";
}
