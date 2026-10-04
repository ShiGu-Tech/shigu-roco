import { ensureLoaded, getRoom, subscribe } from "@/modules/watch/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** SSE：连线即推最新快照，此后每次 PUT 广播；15s 心跳。 */
export async function GET(request: Request, ctx: Ctx) {
  await ensureLoaded();
  const { id } = await ctx.params;
  if (!getRoom(id)) {
    return new Response("房间不存在或已过期", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      };
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const pushRoom = () => {
        const room = getRoom(id);
        if (room) send(`event: room\ndata: ${JSON.stringify(room)}\n\n`);
        else send(`event: gone\ndata: {}\n\n`);
      };

      // 初始快照 + 订阅后续广播。
      pushRoom();
      unsubscribe = subscribe(id, pushRoom);
      heartbeat = setInterval(() => send(": ping\n\n"), 15000);
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
