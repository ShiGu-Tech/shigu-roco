# 变更日志

> 每次发布同步本文件：版本号 + 日期时间 + 改动点。版本号策略：新增功能 bump minor（x.y+1.0）、缺陷修复 / 样式微调 bump patch（x.y.z+1）、破坏性变更 bump major。引擎独立版本见 `apps/web/src/modules/engine/version.ts`。

## 0.128.2 - 2026-10-16 14:40

**修复**

- 手机真机 / 局域网经 `http://<ip>:<port>` 打开时页面卡在「正在加载引擎数据…」：`crypto.randomUUID()` 只在**安全上下文**（HTTPS 或 localhost）可用，非安全上下文下不存在，调用方直接抛错（首个触发点是首次进站播种示例阵容的 `board/lineups.ts`）。新增 `apps/web/src/lib/id.ts` 的 `newId()`（安全上下文 `randomUUID` → `getRandomValues` → `Math.random` 三级兜底），并收敛原先 5 处调用（其中 `lab.tsx` / `pets/instance.ts` 各自写过一遍兜底）。

**工程**

- `apps/web/next.config.ts`：`allowedDevOrigins` 改为可通过 `ROCO_DEV_ORIGINS` 环境变量追加，便于局域网真机调试（不把开发机 IP 写死进仓库）。Next dev 默认拦截跨来源的 `/_next/*` 资源，从 LAN IP 访问时不放行会表现为「页面骨架在、客户端不水合」。

**文档**

- 新增《手机化改造-设计-v0.1》（总纲：手机端外壳 + 首页功能列表 + 6v6 PVP 手机流程 + 拍照/口述 AI 录入 + 共享精灵仓库 + 反推仓库先验）。
- AI 录入通道选定：经 tmxk 能力平台调用 `vision` / `voice` 能力（roco 侧只做业务层：名单匹配、人工确认、降级）；GPU 令牌与上游地址属平台侧，roco 不持有。
