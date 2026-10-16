/** 名单匹配（打字 / 粘贴）：纯本地，不依赖任何外部能力，永远可用。 */

import { badRequest, matchWithSprites, serverError } from "@/modules/ingest/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return badRequest("text 为空");
    // 开发期留痕：出问题时能回放用户到底打了什么（只记这行，不落库）
    console.log("[ingest/text]", JSON.stringify(text).slice(0, 300));
    return Response.json(matchWithSprites(text, "text"));
  } catch (error) {
    return serverError(error);
  }
}
