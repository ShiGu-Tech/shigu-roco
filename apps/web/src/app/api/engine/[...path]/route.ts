import { NextResponse } from "next/server";

import * as handlers from "@/modules/engine/api/handlers";
import { getBundle, reloadBundle } from "@/modules/engine/server";
import type { Dict } from "@/modules/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

async function readJson(request: Request): Promise<Dict> {
  try {
    const body = await request.json();
    return (body ?? {}) as Dict;
  } catch {
    return {};
  }
}

async function handle(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const route = (path ?? []).join("/");
  const method = request.method;

  try {
    if (method === "GET" && route === "health") return json(handlers.health(getBundle()));
    if (method === "GET" && route === "catalog") return json(handlers.catalog(getBundle()));
    if (method === "GET" && route === "bundle") return json(handlers.bundlePayload(getBundle()));
    if (method === "POST" && route === "admin/reload") return json(handlers.health(reloadBundle()));

    const body = await readJson(request);
    switch (route) {
      case "recommend":
        return json(handlers.recommend(getBundle(), body as unknown as handlers.RecommendBody));
      case "simulate/turn":
        return json(handlers.simulateTurn(getBundle(), body));
      case "simulate/forced-switch":
        return json(handlers.forcedSwitch(getBundle(), body));
      case "simulate/leader":
        return json(handlers.leader(getBundle(), body));
      case "opponent/observe":
        return json(handlers.observe(getBundle(), body));
      default:
        return json({ error: `未知路由: ${route}` }, 404);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}

export { handle as GET, handle as POST };
