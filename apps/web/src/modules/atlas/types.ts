/** 引擎全景图轨迹模型（展示层，不参与结算）。
 *
 * 事实源：`BattleEvent.data` 已携带 `trigger` / `mechanismId` / `effectType`
 * （`battle.ts#asBattleEvent`），沙盒 `debugStep` 与对战台 `simulateTurn` 返回的 `log` 即含——引擎零改动。
 */

/** 用户操作（与 `Action` / `EngineAction` 同形，松耦合；`label` 为埋点时已解析好的中文动作名）。 */
export interface AtlasAction {
  side: string;
  kind: string;
  skillId?: string;
  benchId?: string;
  label?: string;
}

/** 一个触发器在本步中被命中的机制（带次数与命中过的效果类型）。 */
export interface AtlasFired {
  trigger: string;
  mechanisms: { id: string; count: number; effects: string[] }[];
  /** 触发器级效果汇总（含无 mechanismId 事件的效果）。 */
  effects: string[];
}

/** 一次「用户操作 → 引擎响应」的聚合（`collect.ts` 纯函数产出）。 */
export interface AtlasStep {
  /** 事件所属回合（步进前的 `state.turn`）。 */
  turn: number;
  actions: AtlasAction[];
  /** 按事件首次出现序；无 `data.trigger` 的引擎原生事件不入桶。 */
  fired: AtlasFired[];
}

/** localStorage 会话轨迹（键 `roco.atlasTrace`）；新来源整体覆盖，不做多局叠加。 */
export interface AtlasTrace {
  source: "debug" | "board";
  updatedAt: number;
  steps: AtlasStep[];
}

/** 机制列表项（`GET workbench/mechanisms` 返回项的本视图所需子集）。 */
export interface AtlasMechanism {
  id: string;
  ownerType: string;
  ownerName: string;
  trigger: string;
  effectCount: number;
  unsupported: boolean;
  registered: boolean;
}
