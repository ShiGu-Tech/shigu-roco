/** 观战房间 id：12 字节随机 → `r-<24 hex>`，不可猜（URL 即密钥）。 */

export function newRoomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `r-${hex}`;
}
