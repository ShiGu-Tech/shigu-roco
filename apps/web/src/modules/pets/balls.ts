/** 咕噜球（捕捉球）：配队时的养成参数，默认「国王球」。
 *
 * 图鉴（roco-world）不含球种数据，故在仓内静态维护；球种影响「契约的形状」特性（星尘虫 / 落星虫 / 陨星虫）。
 * `id` 为引擎键（写入 `StatProfile.ball` → `ActiveSprite.ball`），`label` 为展示名。
 */

export interface BallOption {
  id: string;
  label: string;
  /** 是否有实际效果（无效果球种仅占位，便于与官方清单对齐）。 */
  effective: boolean;
  /** 无图鉴图标，暂用首字色块（留待接入官方球图标 URL）。 */
  icon?: string | null;
}

export const BALL_OPTIONS: BallOption[] = [
  { id: "normal", label: "普通球", effective: true },
  { id: "advanced", label: "高级球", effective: true },
  { id: "king", label: "国王球", effective: true },
  { id: "photosynthesis", label: "光合球", effective: true },
  { id: "net", label: "网兜球", effective: true },
  { id: "thermostat", label: "调温球", effective: true },
  { id: "sand", label: "淘沙球", effective: true },
  { id: "insulation", label: "绝缘球", effective: true },
  { id: "wonderful", label: "美妙球", effective: true },
  { id: "warlike", label: "好战球", effective: true },
  { id: "darkstar", label: "暗星球", effective: true },
  { id: "transform", label: "变幻球", effective: true },
  { id: "capture-light", label: "捕光球", effective: false },
  { id: "dream-prism", label: "织梦棱镜", effective: false },
  { id: "odd", label: "奇趣球", effective: false },
  { id: "carnival-prism", label: "狂欢棱镜", effective: false },
  { id: "prism", label: "棱镜球", effective: true },
];

export const DEFAULT_BALL = "king";

export function ballOptionOf(id: string | undefined | null): BallOption | undefined {
  if (!id) return undefined;
  return BALL_OPTIONS.find((o) => o.id === id);
}

/** 「棱镜球」随机候选池：其它有效果球种（`prism` 自身除外）。 */
export const PRISM_POOL = BALL_OPTIONS.filter((o) => o.effective && o.id !== "prism").map((o) => o.id);
