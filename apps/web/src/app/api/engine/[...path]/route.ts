import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_URL = process.env.ROCO_ENGINE_URL ?? "http://127.0.0.1:26901";

async function forward(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(request.url);
  const target = `${ENGINE_URL}/${path.join("/")}${url.search}`;

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  try {
    const res = await fetch(target, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "引擎未启动", hint: "请运行 scripts/dev.ps1（引擎监听 127.0.0.1:26901）" },
      { status: 502 },
    );
  }
}

export { forward as GET, forward as POST };
