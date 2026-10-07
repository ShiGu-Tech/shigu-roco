/** 精灵试验台领域模型（PVP 1v1 实时设置 · 资质反推）。
 *
 * 三层：
 * - 花名册（`LabPet` / `LabSide`）：双方各一组，可无限「加精灵」，`id` 稳定；
 * - 局面（引擎 `BattleState`投影）：HP / 能量 / buff / 印记 / 状态 / 天气等，实时编辑；
 * - 情报（`LabIntel`）：对方每只的未知 / 推测 / 已确认三级 + 反推候选。
 *
 * 设计见 docs/modules/精灵试验台-设计-v0.1.md。纯数据结构，无副作用。
 */

import type { ActiveSpriteState, BattleEvent, BattleState } from "@/modules/battle/types";
import type { PetSetup, TalentMap } from "@/modules/battle/pet";

export type { TalentMap };
export type { IntelLevel } from "@/modules/board/intel";

export interface LabPet {
  /** 本局稳定实例 id：换下再上场仍记住，同队同种不串。 */
  id: string;
  spriteId: string;
  /** 我方直接编辑；对方可由未知 / 推测 / 已确认回填。 */
  setup: PetSetup;
  /** 该精灵自己的引擎状态（HP / 能量 / buff / 印记 / 状态…），不随换人丢失。 */
  state: ActiveSpriteState;
}

export interface LabSide {
  pets: LabPet[];
  activeId: string;
  magic: number;
  wishChargesLeft: number;
  wishCooldown: number;
  leaderUsed: boolean;
}

export interface NatureCandidate {
  id: string;
  up: string | null;
  down: string | null;
  name: string;
  p: number;
}

export interface TalentCandidate {
  talent: TalentMap;
  p: number;
}

/** 某只精灵的情报档案（三级 + 反推候选）；观测事实统一记在 `Interaction` 上。 */
export interface LabIntel {
  skills: { id: string; turn: number }[];
  nature: { level: "unknown" | "inferred" | "known"; value: string | null; candidates: NatureCandidate[] };
  talent: { level: "unknown" | "inferred" | "known"; value: TalentMap; candidates: TalentCandidate[] };
  bloodline: { level: "unknown" | "inferred" | "known"; value: string | null };
}

export type LabSideKey = "self" | "opp";

/** 一次交互的登记结果：谁受击、伤害、血条变化。 */
export interface InteractionResult {
  /** 受击方（掉血的一方）。 */
  defender: LabSideKey;
  damage: number;
  /** 本次血条下降百分点（与历史无关）。 */
  dropPct?: number;
  /** 命中后剩余百分比。 */
  remainPct?: number;
}

/** 一条交互记录：双方本回合技能 + 可选的结果登记。 */
export interface Interaction {
  id: string;
  turn: number;
  /** 我方 / 对方本回合技能（无技能动作为空）。 */
  selfSkillId?: string;
  oppSkillId?: string;
  /** 是否触发「应对」（结算时检测）。 */
  counter?: boolean;
  result?: InteractionResult;
}

export interface Observation {
  id: string;
  turn: number;
  kind: "damage" | "hp" | "speed";
  /** 进攻方（对侧）是哪只精灵实例（可能不是当前上场的那只）。 */
  attackerPetId?: string;
  /** 进攻方（对侧）用于攻击的技能 id（伤害观测）。 */
  attackerSkillId?: string;
  /** 受击方本回合动作："" / "defend"（防御）/ "counter"（应对）/ 技能 id——记录双方交互。 */
  defenderAction?: string;
  /** 实测单段原始伤害（绝对值，伤害观测）。 */
  damage?: number;
  /** 本次血条下降百分点 0~100（与历史无关，反推最大 HP 用）。 */
  dropPct?: number;
  /** 命中后血条剩余百分比 0~100（当只知剩余时使用）。 */
  remainPct?: number;
  /** 先手归属（速度观测；优先级招式会干扰，标【待校准】）。 */
  speedFirst?: "self" | "opp";
  note?: string;
  /** 引擎辅助：该交互跑引擎得到的守方受击伤害（已计入特性 / 减伤 / 天气）。用于校正反推目标防御。 */
  engineDamage?: number;
}

/** 反推得到的「最吻合组合」：性格 × 天分 × 面板 + 预测伤害。 */
export interface BestBuild {
  nature: { up: string | null; down: string | null; name: string };
  talent: TalentMap;
  panel: Record<string, number>;
  /** 按该组合防御缩放引擎伤害得到的预测伤害。 */
  predictedDamage: number;
  /** 与引擎校正目标防御的偏差比例（0 = 完全吻合）。 */
  error: number;
}

/** 反推结果（由 `infer.ts` 现算，不落盘）。 */
export interface InferResult {
  nature: NatureCandidate[];
  talent: TalentCandidate[];
  defense?: [number, number];
  maxHp?: [number, number];
  speed?: [number, number];
  sampleCount: number;
  candidateCount: number;
  /** 是否命中「推荐加点（3 项满 +10）」收敛组。 */
  recommended: boolean;
  /** 拟合经放宽（观测误差较大 / 有未计入倍率）。 */
  approximate: boolean;
  /** 观测区间互斥（无解）。 */
  conflict: boolean;
  /** 提示（未计入的减伤 / 增益 / 特性、区间不可达等）。 */
  notes: string[];
  /** 最吻合的（性格 × 天分）组合，按与引擎校正目标防御的接近度排序。 */
  best?: BestBuild[];
}

/** 一个可回退的存档点：某回合开始前的局面。 */
export interface LabFrame {
  turn: number;
  state: BattleState;
  log: BattleEvent[];
  label: string;
}

/** 试验台完整状态（花名册 + 左右局面 + 情报 + 交互记录 + 回合 / 天气）。 */
export interface LabState {
  self: LabSide;
  opp: LabSide;
  /** 情报：key = 精灵实例 id（两侧都有）。 */
  intel: Record<string, LabIntel>;
  /** 交互记录（按回合，双方技能 + 结果）。 */
  interactions: Interaction[];
  turn: number;
  weather: { id: string; turnsLeft: number } | null;
  seed: number;
}

/** 持久化存档（localStorage）。 */
export interface LabSave {
  self: LabSide;
  opp: LabSide;
  intel: Record<string, LabIntel>;
  interactions?: Interaction[];
  turn: number;
  weather: { id: string; turnsLeft: number } | null;
  seed: number;
}

export function newIntel(): LabIntel {
  return {
    skills: [],
    nature: { level: "unknown", value: null, candidates: [] },
    talent: { level: "unknown", value: {}, candidates: [] },
    bloodline: { level: "unknown", value: null },
  };
}

export function intelOf(map: Record<string, LabIntel>, id: string): LabIntel {
  return map[id] ?? newIntel();
}
