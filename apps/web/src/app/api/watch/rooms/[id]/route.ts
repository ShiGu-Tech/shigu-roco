import { NextResponse } from "next/server";

import { deleteRoom, getRoom, putRoom } from "@/modules/watch/store";
import type { WatchRoom } from "@/modules/watch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 读取当前快照（首屏 / 轮询兜底）。 */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const room = getRoom(id);
  if (!room) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });
  return NextResponse.json(room);
}

/** 宿主推全量快照。 */
export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Partial<WatchRoom>;
  try {
    body = (await request.json()) as Partial<WatchRoom>;
  } catch {
    return NextResponse.json({ error: "无效请求体" }, { status: 400 });
  }
  if (!body || body.id !== id || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: "快照缺失 id / entries" }, { status: 400 });
  }
  const ok = putRoom(body as WatchRoom);
  if (!ok) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** 结束并删除（宿主可选调用）。 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json({ ok: deleteRoom(id) });
}
