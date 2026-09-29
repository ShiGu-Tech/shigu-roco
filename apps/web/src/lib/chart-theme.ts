/**
 * 图表配色统一取自 `globals.css` 的语义 token（`--chart-*` / `--muted-foreground` / `--border`），
 * 代码里不散落硬编码色值；换主题只改 `globals.css`。
 */

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** 对局双方配色：我方（暖色）、敌方（冷色）。 */
export const PLAYER_COLOR = "var(--chart-5)";
export const ENEMY_COLOR = "var(--chart-2)";

export const AXIS_COLOR = "var(--muted-foreground)";
export const GRID_COLOR = "var(--border)";

/**
 * ECharts 不解析 CSS 变量，绘制前把 `var(--x)` 换成实际色值。
 * DOM 样式（`borderLeftColor` 等）可直接用 token 字符串，无需经过这里。
 */
export function resolveColor(value: string): string {
  if (!value.startsWith("var(")) return value;
  if (typeof document === "undefined") return value;
  const token = value.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || value;
}
