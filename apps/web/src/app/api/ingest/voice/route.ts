/**
 * 口述 → 名单候选。经 tmxk 能力平台 `voice:transcribe`（上游首次调用要加载模型，超时放宽）。
 * 未配置能力时返回 503，前端降级为「打字 / 从仓库挑」。
 */

import { badRequest, capabilityUnavailable, matchWithSprites, serverError } from "@/modules/ingest/server";
import { tmxkConfigured, tmxkVoiceTranscribe } from "@/modules/ingest/tmxk";

export const runtime = "nodejs";

/** 内联音频上限 16MB（base64 前）。 */
const MAX_BASE64_CHARS = 16 * 1024 * 1024 * 4 / 3;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { audio?: string; mime?: string; diarize?: boolean };
    const audio = typeof body.audio === "string" ? body.audio.replace(/^data:[^,]+,/, "") : "";
    if (!audio) return badRequest("audio 为空");
    if (audio.length > MAX_BASE64_CHARS) return badRequest("音频过大（上限 16MB）");
    if (!tmxkConfigured()) return capabilityUnavailable();

    const text = await tmxkVoiceTranscribe(audio, body.mime ?? "audio/webm", body.diarize === true);
    if (!text.trim()) return badRequest("没有识别到语音内容，请靠近麦克风重说一次");
    return Response.json(matchWithSprites(text, "voice"));
  } catch (error) {
    return serverError(error);
  }
}
