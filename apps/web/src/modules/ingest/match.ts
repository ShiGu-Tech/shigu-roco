/**
 * 名单匹配器：把识别出的文字（截图 OCR 行 / 语音转写 / 手打名单）切成片段，
 * 对图鉴精灵名做匹配，输出**带置信度**的候选，供前端人工确认。
 *
 * 纯函数、零依赖：服务端（`/api/ingest/*`）与浏览器共用；这是"识别 → 建队"里的业务层，
 * 能力平台（tmxk `vision` / `voice`）只负责把图/音变成文字。
 *
 * 匹配强度（置信度）：
 *   1.00 完全相等 ｜ 0.96 归一化相等（去空格标点） ｜ 0.90 片段包含名字
 *   0.78 名字包含片段（片段 ≥2 字） ｜ ≤0.85 编辑距离相近（相似度 × 0.9）
 */

export interface NameEntry {
  id: string;
  name: string;
  /** 形态名（如「春天的样子」）。同名多形态时用来区分与提示。 */
  form?: string | null;
  formId?: number;
  /** 进化阶数（越大越高阶）。歧义时优先高阶——PVP 用最终形态。 */
  stage?: number;
}

export interface MatchCandidate {
  id: string;
  name: string;
  confidence: number;
  form?: string | null;
}

/** 常见形态提示词（颜色 / 季节 / 状态）；对不上形态名时要显式提示，不能当噪声吞掉。 */
export const FORM_HINTS = [
  "蓝色", "绿色", "红色", "黄色", "紫色", "粉色", "白色", "黑色", "金黄", "枯叶", "黑化",
  "春天", "夏天", "秋天", "冬天", "蓬松", "紧实", "睁眼", "闭眼", "海神", "彩玉", "短毛", "象牙", "星光", "月光",
];

/** 从原文里找形态提示词（用于在多个形态间挑选/提示）。 */
export function formHintOf(text: string): string | undefined {
  return FORM_HINTS.find((hint) => text.includes(hint));
}

export interface SegmentMatch {
  /** 原文片段（原样回显，方便用户核对） */
  text: string;
  candidates: MatchCandidate[];
}

export interface MatchResult {
  segments: SegmentMatch[];
  /** 未匹配到任何精灵的片段（提示用户手动处理） */
  unmatched: string[];
}


/** 归一化：全角转半角、去空白与标点（含中文标点）、去噪词，小写。 */
export function normalizeName(raw: string): string {
  return raw
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s·・.。,'"“”‘’()（）\[\]【】<>《》\-—_/\\|、，；：！？…～「」『』〔〕]/g, "")
    .replace(/(精灵|宝可梦|宠物|一只|这只|那只|只$)+/g, "")
    .toLowerCase();
}

/** 编辑距离（带长度提前退出）。 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - editDistance(a, b) / max;
}

/** 单个片段 → 候选（内部用，导出便于单测）。
 *
 * 排序规则（同分时）：① 命中形态提示词者优先；② **高阶优先**（stage 大者在前，PVP 用最终形态）；
 * ③ 形态序号小者在前（缺省「本来的样子」）。
 */
export function matchSegment(segment: string, entries: NameEntry[], formHint?: string): MatchCandidate[] {
  const needle = normalizeName(segment);
  if (!needle) return [];
  const hits: (MatchCandidate & { formId: number; stage: number; hintHit: boolean })[] = [];
  for (const entry of entries) {
    const hay = normalizeName(entry.name);
    if (!hay) continue;
    let confidence = 0;
    if (segment === entry.name || needle === hay) {
      confidence = segment === entry.name ? 1 : 0.96;
    } else if (needle.includes(hay) && hay.length >= 2) {
      confidence = 0.9;
    } else if (hay.includes(needle) && needle.length >= 2) {
      confidence = 0.78;
    } else {
      const sim = similarity(needle, hay);
      const allowed = Math.max(needle.length, hay.length) >= 3 ? 0.62 : 0.75;
      if (sim >= allowed) confidence = sim * 0.9;
    }
    if (confidence > 0) {
      hits.push({
        id: entry.id,
        name: entry.name,
        confidence: Number(confidence.toFixed(3)),
        form: entry.form ?? null,
        formId: entry.formId ?? 0,
        stage: entry.stage ?? 0,
        hintHit: Boolean(formHint && entry.form && entry.form.includes(formHint)),
      });
    }
  }
  hits.sort(
    (a, b) =>
      (b.hintHit ? 1 : 0) - (a.hintHit ? 1 : 0) ||
      b.confidence - a.confidence ||
      b.stage - a.stage ||
      a.formId - b.formId,
  );
  return hits.slice(0, 3).map(({ id, name, confidence, form }) => ({ id, name, confidence, form }));
}

/** 名单文本 → 逐片段候选 + 未命中片段。
 *
 * 真实用户是"口语化写法"：带编号、带形态/颜色修饰、甚至把两只连写（"翼王骨龙"=圣羽翼王+寂灭骨龙）。
 * 所以先剔除噪声、再用**图鉴名字典在整段文本里扫描**（最长优先、不重叠），残余片段才走模糊匹配，
 * 并把"是某个名字的后缀/前缀"的简称（骨龙→寂灭骨龙、翼王→圣羽翼王）作为兜底候选。
 */
export function matchNames(text: string, entries: NameEntry[]): MatchResult {
  const cleaned = cleanText(text);
  const hint = formHintOf(text);
  const scanned = scanDictionary(cleaned, entries);
  const matches: SegmentMatch[] = [];
  const unmatched: string[] = [];

  for (const item of scanned) {
    if (item.hits.length > 0) {
      // 同一段里命中多只（连写）：逐只给候选
      for (const hit of item.hits) {
        // 同名多形态（如岚鸟 4 种）→ 全部作为候选，按 形态提示 / 高阶 / 形态序号 排序
        const sameName = entries.filter((entry) => entry.name === hit.name);
        const candidates = rankForms(sameName.length > 0 ? sameName : [{ id: hit.id, name: hit.name }], hint, 0.95);
        pushSegment(matches, { text: hit.name, candidates });
      }
      continue;
    }
    const candidates = leftoverCandidates(item.text, entries, hint);
    if (candidates.length === 0) {
      if (normalizeName(item.text).length >= 2) unmatched.push(item.text);
      continue;
    }
    pushSegment(matches, { text: item.text, candidates });
  }
  return { segments: matches, unmatched };
}

/** 同名候选排序：形态提示命中 > 高阶（stage）> 形态序号（formId）。 */
function rankForms(list: NameEntry[], hint: string | undefined, confidence: number): MatchCandidate[] {
  return [...list]
    .sort(
      (a, b) =>
        (b.form && hint && b.form.includes(hint) ? 1 : 0) - (a.form && hint && a.form.includes(hint) ? 1 : 0) ||
        (b.stage ?? 0) - (a.stage ?? 0) ||
        (a.formId ?? 0) - (b.formId ?? 0),
    )
    .slice(0, 4)
    .map((entry) => ({ id: entry.id, name: entry.name, confidence, form: entry.form ?? null }));
}

/** 编号（1. / 2、/ ①）、侧别词（我方/敌方/…）与修饰词（形态 / 颜色 / 剩余…）——不参与匹配。 */
export function cleanText(text: string): string {
  return text
    .replace(/(?:\d+\s*[.、)）]|[\u2460-\u2473])/g, " ")
    .replace(/(?:形态|蓝色|绿色|红色|黑色|白色|黄色|紫色|粉色|灰色|橙色|剩余|进化|原始|最终|幼年|成年)/g, " ")
    .replace(/(我方|我的|己方|自家|红方|我们|本队|对方|敌方|对面|对手|蓝方|他们|敌队|阵容|带了|还有|以及)/g, " ");
}

interface DictEntry {
  /** 用于在文本里查找的字符串（全名，或全局唯一的简称） */
  match: string;
  id: string;
  name: string;
  confidence: number;
}

let dictCache: { key: NameEntry[]; dict: DictEntry[] } | null = null;

/** 词典 = 全名 + **全局唯一**的 2~3 字简称（骨龙→寂灭骨龙、翼王→圣羽翼王、狐仙→尖嘴狐仙）。 */
function buildDictionary(entries: NameEntry[]): DictEntry[] {
  if (dictCache && dictCache.key === entries) return dictCache.dict;
  const full = entries.filter((entry) => entry.name.length >= 2);
  const counts = new Map<string, number>();
  const bump = (alias: string) => counts.set(alias, (counts.get(alias) ?? 0) + 1);
  for (const entry of full) {
    for (const len of [2, 3]) {
      if (entry.name.length <= len) continue;
      bump(entry.name.slice(-len));
      bump(entry.name.slice(0, len));
    }
  }
  const dict: DictEntry[] = full.map((entry) => ({ match: entry.name, id: entry.id, name: entry.name, confidence: 0.95 }));
  for (const entry of full) {
    for (const len of [2, 3]) {
      if (entry.name.length <= len) continue;
      for (const alias of [entry.name.slice(-len), entry.name.slice(0, len)]) {
        if ((counts.get(alias) ?? 0) === 1) dict.push({ match: alias, id: entry.id, name: entry.name, confidence: 0.8 });
      }
    }
  }
  // 最长匹配优先；同等长度下全名（置信度高）优先
  dict.sort((a, b) => b.match.length - a.match.length || b.confidence - a.confidence);
  dictCache = { key: entries, dict };
  return dict;
}

interface ScanItem {
  text: string;
  hits: { id: string; name: string; confidence: number }[];
}

/** 名字词典扫描：返回按出现顺序的块，每块要么命中若干图鉴名，要么是待模糊匹配的残余文本。 */function scanDictionary(text: string, entries: NameEntry[]): ScanItem[] {
  const dict = buildDictionary(entries);
  const lower = text.toLowerCase();
  const used = new Array(text.length).fill(false);
  const found: { start: number; end: number; id: string; name: string; confidence: number }[] = [];
  for (const entry of dict) {
    const needle = entry.match.toLowerCase();
    let from = 0;
    while (from <= lower.length - needle.length) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      let free = true;
      for (let i = index; i < index + needle.length; i += 1) {
        if (used[i]) {
          free = false;
          break;
        }
      }
      if (free) {
        for (let i = index; i < index + needle.length; i += 1) used[i] = true;
        found.push({ start: index, end: index + needle.length, id: entry.id, name: entry.name, confidence: entry.confidence });
      }
      from = index + 1;
    }
  }
  found.sort((a, b) => a.start - b.start);

  const items: ScanItem[] = [];
  let cursor = 0;
  for (const hit of found) {
    if (hit.start > cursor) {
      const gap = text.slice(cursor, hit.start).trim();
      if (gap) items.push({ text: gap, hits: [] });
    }
    const last = items[items.length - 1];
    // 相邻命中（连写，如 "圆号鱼骨龙"）并进同一块
    if (last && last.hits.length > 0 && hit.start === cursor) last.hits.push({ id: hit.id, name: hit.name, confidence: hit.confidence });
    else items.push({ text: hit.name, hits: [{ id: hit.id, name: hit.name, confidence: hit.confidence }] });
    cursor = hit.end;
  }
  const tail = text.slice(cursor).trim();
  if (tail) items.push({ text: tail, hits: [] });
  return items;
}

/** 残余片段：先编辑距离，再退到"某图鉴名的后缀/前缀"（简称，如 骨龙 / 翼王 / 狐仙）。 */
function leftoverCandidates(span: string, entries: NameEntry[], hint?: string): MatchCandidate[] {
  const needle = normalizeName(span);
  if (needle.length < 2) return [];
  const fuzzy = matchSegment(span, entries, hint);
  if (fuzzy.length > 0) return fuzzy;
  const affix = entries.filter(
    (entry) => entry.name.length > needle.length && (entry.name.endsWith(needle) || entry.name.startsWith(needle)),
  );
  return rankForms(affix, hint, 0.72);
}

/** 同 id 只保留一条（"尖嘴"+"狐仙"都指向尖嘴狐仙时不要算两只）。 */
function pushSegment(list: SegmentMatch[], segment: SegmentMatch): void {
  const id = segment.candidates[0]?.id;
  if (id && list.some((item) => item.candidates[0]?.id === id)) return;
  list.push(segment);
}

/** 侧别：一张截图 / 一段口述常同时带双方名单。 */
export type Side = "player" | "enemy" | "unknown";

const PLAYER_MARK = /(我方|我的|己方|自家|红方|我们|本队)/;
const ENEMY_MARK = /(对方|敌方|对面|对手|蓝方|他们|敌队)/;
const SIDE_MARK_RE = new RegExp(`${PLAYER_MARK.source}|${ENEMY_MARK.source}`, "g");

/** 把识别文本按侧别标记切成若干块（未出现标记则整段 `unknown`）。 */
export function splitSides(text: string): { side: Side; text: string }[] {
  const chunks: { side: Side; text: string }[] = [];
  let current: Side = "unknown";
  let cursor = 0;
  for (const match of text.matchAll(SIDE_MARK_RE)) {
    const index = match.index ?? 0;
    const before = text.slice(cursor, index).trim();
    if (before) chunks.push({ side: current, text: before });
    current = PLAYER_MARK.test(match[0]) ? "player" : "enemy";
    cursor = index + match[0].length;
  }
  const tail = text.slice(cursor).trim();
  if (tail) chunks.push({ side: current, text: tail });
  return chunks;
}

export interface SidedMatchResult {
  player: SegmentMatch[];
  enemy: SegmentMatch[];
  unknown: SegmentMatch[];
  unmatched: string[];
}

/** 名单文本 → 按侧别分组的候选（一张图带双方时一次出两组）。 */
export function matchSides(text: string, entries: NameEntry[]): SidedMatchResult {
  const result: SidedMatchResult = { player: [], enemy: [], unknown: [], unmatched: [] };
  const chunks = splitSides(text);
  // 没有任何侧别标记且只有一批片段：留在 unknown，由前端让用户落位（图片常带双方，不猜）
  for (const chunk of chunks) {
    const matched = matchNames(chunk.text, entries);
    result[chunk.side].push(...matched.segments);
    result.unmatched.push(...matched.unmatched);
  }
  return result;
}
