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
  /** 球图标 public 路径（`/images/balls/<id>.png`，取自官方特性详解海报）。 */
  icon: string;
}

const ball = (id: string, label: string, effective: boolean): BallOption => ({ id, label, effective, icon: `/images/balls/${id}.png` });

export const BALL_OPTIONS: BallOption[] = [
  ball("normal", "普通球", true),
  ball("advanced", "高级球", true),
  ball("king", "国王球", true),
  ball("photosynthesis", "光合球", true),
  ball("net", "网兜球", true),
  ball("thermostat", "调温球", true),
  ball("sand", "淘沙球", true),
  ball("insulation", "绝缘球", true),
  ball("wonderful", "美妙球", true),
  ball("warlike", "好战球", true),
  ball("darkstar", "暗星球", true),
  ball("transform", "变幻球", true),
  ball("capture-light", "捕光球", false),
  ball("dream-prism", "织梦棱镜", false),
  ball("odd", "奇趣球", false),
  ball("carnival-prism", "狂欢棱镜", false),
  ball("prism", "棱镜球", true),
];

export const DEFAULT_BALL = "king";

export function ballOptionOf(id: string | undefined | null): BallOption | undefined {
  if (!id) return undefined;
  return BALL_OPTIONS.find((o) => o.id === id);
}

/** 「棱镜球」随机候选池：其它有效果球种（`prism` 自身除外）。 */
export const PRISM_POOL = BALL_OPTIONS.filter((o) => o.effective && o.id !== "prism").map((o) => o.id);
