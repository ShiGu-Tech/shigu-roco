/**
 * 录入（/api/ingest/*）服务端共用件：图鉴名单 → 匹配 → 附上头像供前端直接渲染。
 *
 * 业务层定位：能力平台只把「图 / 音」变成文字，**把文字对齐到图鉴精灵**是 roco 自己的事
 * （见 docs/architecture/手机化改造-设计-v0.1.md §5.2）。
 */

import { getBundle } from "@/modules/engine/server";
import { matchSides, type NameEntry, type SidedMatchResult } from "./match";

export interface IngestCandidate {
  id: string;
  name: string;
  confidence: number;
  /** 形态名（同名多形态时用来区分，如「春天的样子」） */
  formLabel?: string;
  image?: string;
  head?: string;
}

export interface IngestSide {
  text: string;
  candidates: IngestCandidate[];
}

/** 一次识别可同时带双方名单（截图常见）：按侧别分组返回，未标侧别的进 `unknown` 由用户落位。 */
export interface IngestResult {
  player: IngestSide[];
  enemy: IngestSide[];
  unknown: IngestSide[];
  unmatched: string[];
  text: string;
  source: "text" | "photo" | "voice";
}

/** 激活图鉴的精灵名单（id + 中文名 + 形态 / 阶数：同名多形态与"高阶优先"都要用）。 */
export function spriteEntries(): NameEntry[] {
  const bundle = getBundle();
  return Object.values(bundle.sprites).map((sprite) => ({
    id: String(sprite.id),
    name: String(sprite.nameZh ?? sprite.name ?? ""),
    form: sprite.form ? String(sprite.form) : null,
    formId: Number(sprite.formId ?? 0),
    stage: Number(sprite.stage ?? 0),
  }));
}

/** 匹配结果 + 头像（前端候选列表直接用）。 */
export function matchWithSprites(text: string, source: IngestResult["source"]): IngestResult {
  const bundle = getBundle();
  const sided: SidedMatchResult = matchSides(text, spriteEntries());
  const toSides = (segments: SidedMatchResult["player"]): IngestSide[] =>
    segments.map((segment) => ({
      text: segment.text,
      candidates: segment.candidates.map((candidate) => {
        const sprite = bundle.sprites[candidate.id];
        return {
          id: candidate.id,
          name: candidate.name,
          confidence: candidate.confidence,
          formLabel: candidate.form ?? undefined,
          image: sprite ? String(sprite.image ?? "") || undefined : undefined,
          head: sprite ? String(sprite.head ?? "") || undefined : undefined,
        };
      }),
    }));
  return {
    player: toSides(sided.player),
    enemy: toSides(sided.enemy),
    unknown: toSides(sided.unknown),
    unmatched: sided.unmatched,
    text,
    source,
  };
}

export function capabilityUnavailable(): Response {
  return Response.json(
    {
      code: "CAPABILITY_UNAVAILABLE",
      message: "识别服务未接入（tmxk vision / voice 能力待上线）。可先用「打字」或「从仓库挑」建队。",
    },
    { status: 503 },
  );
}

export function badRequest(message: string): Response {
  return Response.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

export function serverError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ code: "INGEST_FAILED", message }, { status: 502 });
}
