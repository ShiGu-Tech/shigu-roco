import { NextResponse } from "next/server";

import { createRoom, ensureLoaded, type CreateRoomInput } from "@/modules/watch/store";
import { persistRoom } from "@/modules/watch/persistence";
import type { RoomSide } from "@/modules/watch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asSide(value: unknown): RoomSide {
  const side = (value ?? {}) as Partial<RoomSide>;
  return {
    label: typeof side.label === "string" ? side.label : "",
    sprites: Array.isArray(side.sprites) ? side.sprites : [],
  };
}

/** 建房：宿主（对战台）开战时调用。 */
export async function POST(request: Request) {
  await ensureLoaded();
  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    /* 空体允许 */
  }
  const room = createRoom({
    seed: typeof body.seed === "number" ? body.seed : 0,
    player: asSide(body.player),
    enemy: asSide(body.enemy),
    dataVersion: typeof body.dataVersion === "string" ? body.dataVersion : "",
    engineVersion: typeof body.engineVersion === "string" ? body.engineVersion : "",
  } satisfies CreateRoomInput);
  persistRoom(room);
  return NextResponse.json({ id: room.id });
}
