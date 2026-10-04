/** 对局双方的展示名：player = 红方、enemy = 蓝方。
 *
 * 统一「我方 / 敌方」这类第一人称措辞——对局日志里既有行动方又有受影响方，
 * 用「我方 / 敌方」易混淆；改用中性的红 / 蓝。展示层唯一来源，禁止各处硬编码。
 */

export const SIDE_NAME: Record<"player" | "enemy", string> = { player: "红方", enemy: "蓝方" };

export function sideNameOf(side: string | null | undefined): string {
  return side === "player" ? SIDE_NAME.player : side === "enemy" ? SIDE_NAME.enemy : "";
}
