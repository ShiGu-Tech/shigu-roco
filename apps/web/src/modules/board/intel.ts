/** 对手情报档案（真实对战模式）：未知 / 推测 / 已确认 三级。
 *
 * 绑定在本局对手精灵（按 `spriteId`，换人仍记住）；随对局快照存 / 回放、跨局并进对手库。
 * 设计见 docs/modules/真实对战模式-设计-v0.1.md。纯数据操作，无副作用。
 */

export type IntelLevel = "unknown" | "inferred" | "known";

export interface IntelObservation {
  turn: number;
  kind: "damage" | "hp" | "speed";
  /** 我方用于攻击的技能（伤害观测）。 */
  skillId?: string;
  damage?: number;
  /** 目标血条剩余百分比（0~100）。 */
  remainPct?: number;
}

export interface RandomResult {
  turn: number;
  sourceSkillId: string;
  becameSkillId: string;
}

export interface OpponentIntel {
  spriteId: string;
  /** 已见技能（按首次使用顺序）。 */
  skills: { id: string; turn: number }[];
  nature: { value: string | null; level: IntelLevel };
  talent: { value: Partial<Record<string, number>>; level: IntelLevel };
  bloodline: { value: string | null; level: IntelLevel };
  magic: { wish: boolean; leader: boolean; grass: boolean };
  randomResults: RandomResult[];
  observations: IntelObservation[];
}

export function newIntel(spriteId: string): OpponentIntel {
  return {
    spriteId,
    skills: [],
    nature: { value: null, level: "unknown" },
    talent: { value: {}, level: "unknown" },
    bloodline: { value: null, level: "unknown" },
    magic: { wish: false, leader: false, grass: false },
    randomResults: [],
    observations: [],
  };
}

export function intelOf(map: Record<string, OpponentIntel>, spriteId: string): OpponentIntel {
  return map[spriteId] ?? newIntel(spriteId);
}

/** 记录对手「实际使用」的技能（去重，保留首次使用回合）。 */
export function recordSeenSkill(intel: OpponentIntel, skillId: string, turn: number): OpponentIntel {
  if (!skillId || intel.skills.some((s) => s.id === skillId)) return intel;
  return { ...intel, skills: [...intel.skills, { id: skillId, turn }] };
}

/** 记录对手释放过的「魔法」。 */
export function recordMagic(intel: OpponentIntel, kind: "wish" | "leader" | "grass"): OpponentIntel {
  return { ...intel, magic: { ...intel.magic, [kind]: true } };
}

/** 记录一次观测（伤害 / 血量 / 先后手）。 */
export function recordObservation(intel: OpponentIntel, obs: IntelObservation): OpponentIntel {
  return { ...intel, observations: [...intel.observations, obs] };
}

/** 记录随机技能 / 巧变的实际结果（面板反馈）。 */
export function recordRandomResult(intel: OpponentIntel, turn: number, sourceSkillId: string, becameSkillId: string): OpponentIntel {
  return { ...intel, randomResults: [...intel.randomResults, { turn, sourceSkillId, becameSkillId }] };
}

/** 人工标记：直接置为已确认（覆盖推断）。 */
export function markNature(intel: OpponentIntel, value: string | null): OpponentIntel {
  return { ...intel, nature: { value, level: "known" } };
}
export function markTalent(intel: OpponentIntel, value: Partial<Record<string, number>>): OpponentIntel {
  return { ...intel, talent: { value, level: "known" } };
}
export function markBloodline(intel: OpponentIntel, value: string | null): OpponentIntel {
  return { ...intel, bloodline: { value, level: "known" } };
}

/** 某字段的展示状态：已确认 > 推测 > 未知。 */
export function fieldBadge(level: IntelLevel): string {
  return level === "known" ? "已确认" : level === "inferred" ? "推测" : "未知";
}
