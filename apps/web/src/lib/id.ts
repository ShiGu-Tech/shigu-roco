/**
 * 唯一 id 生成（本地存档 / 观战房间 / 记录等）。
 *
 * ⚠️ 不要直接调 `crypto.randomUUID()`：它只在**安全上下文**（HTTPS 或 localhost）可用。
 * 走局域网 `http://<ip>:port` 打开时（手机真机调试、内网部署）`crypto.randomUUID` 不存在，
 * 调用方会抛 `crypto.randomUUID is not a function`，页面卡在「正在加载引擎数据…」——
 * 这个坑在 2026-10-16 手机真机调试时踩过。
 *
 * 三级兜底：安全上下文 `randomUUID` → `getRandomValues`（非安全上下文也可用，拼 v4）→ `Math.random`。
 */
export function newId(prefix = ""): string {
  const webCrypto = typeof crypto !== "undefined" ? crypto : undefined;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return `${prefix}${webCrypto.randomUUID()}`;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
