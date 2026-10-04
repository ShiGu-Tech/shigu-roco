"use client";

/** 观战房间的宿主侧客户端：建房 / 推快照 / 生成观战链接。 */

import type { RoomSide, WatchRoom } from "./types";

export interface CreateWatchInput {
  seed: number;
  player: RoomSide;
  enemy: RoomSide;
  dataVersion: string;
  engineVersion: string;
}

/** 建房（开战时调用），返回不可猜的房间 id。 */
export async function createWatchRoom(input: CreateWatchInput): Promise<string> {
  const res = await fetch("/api/watch/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`建房失败（${res.status}）`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** 推全量快照（每回合 / 终局）。 */
export async function pushWatchRoom(room: WatchRoom): Promise<void> {
  await fetch(`/api/watch/rooms/${room.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(room),
  });
}

/** 观战链接（当前站点 origin + `/watch/<id>`）。 */
export function watchUrl(id: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/watch/${id}`;
}
