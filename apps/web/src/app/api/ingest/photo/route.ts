/**
 * 截图 / 拍照 → 名单候选。经 tmxk 能力平台 `vision:ocr`（roco 不直连 GPU 服务）。
 * 未配置能力时返回 503，前端降级为「打字 / 从仓库挑」。
 */

import { badRequest, capabilityUnavailable, matchWithSprites, serverError } from "@/modules/ingest/server";
import { tmxkConfigured, tmxkVisionOcr } from "@/modules/ingest/tmxk";

export const runtime = "nodejs";

/** 内联图片上限 8MB（base64 前），避免把能力端当图床。 */
const MAX_BASE64_CHARS = 8 * 1024 * 1024 * 4 / 3;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { image?: string; hint?: string };
    const image = typeof body.image === "string" ? body.image.replace(/^data:[^,]+,/, "") : "";
    if (!image) return badRequest("image 为空");
    if (image.length > MAX_BASE64_CHARS) return badRequest("图片过大（上限 8MB）");
    if (!tmxkConfigured()) return capabilityUnavailable();

    const text = await tmxkVisionOcr(image, body.hint);
    return Response.json(matchWithSprites(text, "photo"));
  } catch (error) {
    return serverError(error);
  }
}
