# AGENTS · ShiGuRock

洛克王国世界 PVP 决策辅助工具的工程约定。技术栈参考 `D:\ShiGuZone\main`，但按本项目「离线、单人、无数据库」的定位做了裁剪。

## 定位红线（任何改动都不得违反）

- **非外挂**：不读取游戏画面、不读内存、不抓包、不自动操作游戏、不联网（运行时）。
- **数据与代码解耦**：精灵 / 技能 / 印记 / 天气 / 属性 / 规则全部在 `data/*.json`；版本更新只改 JSON。
- **模拟器是固定规则，MCTS 是搜索模型**：不在 MCTS 里写游戏策略硬编码。

## 大功能流程（硬性）

- 新增领域模型或结构性改动，先在 `docs/modules/`（跨模块的放 `docs/architecture/`）建独立设计稿，经确认后再开发。
- 设计稿至少覆盖：定位与边界、设计原则、领域模型、接口 / 契约、关键决策、非目标、实施状态。
- 实施完成后回填同一设计稿，并同步 `docs/项目状态.md`（必要时 `docs/项目全景手册.md`）。
- 小改动（缺陷修复、样式、文案、小交互）不走设计稿。

## 目录与结构

```text
apps/web/src/modules/engine/  TS 引擎（模拟器 + MCTS + 贝叶斯 + 养成 + API/Worker）
apps/web/                     Next.js 16 前端
data/                         结构化 JSON（唯一数据事实源）
docs/                         设计稿（索引进 docs/README.md）
scripts/                      setup / dev
```

- 前端：`@/*` → `apps/web/src/*`；业务按 `src/modules/<name>/` 组织，纯逻辑与展示分离。
- 引擎：`modules/engine/` 包内按 `types / rng / data / stats / effects / simulator / mcts / opponent / api / worker` 分层。
- 数据加载只认 `data/`；代码中不得出现精灵 / 技能 / 倍率等游戏数据魔法数字（算法常量除外）。

## 自验与命令

- 引擎：`pnpm -F web test`（vitest：数据校验、伤害、印记、结算、MCTS 复现、养成）。
- 前端：`pnpm -F web lint && pnpm -F web typecheck`。
- 全量：`pnpm check`（= 前端 lint+typecheck + 引擎测试；由根 `package.json` 代理）。
- 数据改动：必须过引擎数据测试（`data.ts` 校验 + `__tests__/engine.test.ts` 数据组；schema + 引用完整性）。
- 每次改动完成：跑 `pnpm check`，并在本地 `26900` 冒烟相关页面（引擎内置，无需单独启动）。

## 数据维护流程

1. 官方公告 / Wiki → 定位受影响 JSON 条目。
2. 按下文格式修改，更新该文件 `version` 与 `updatedAt`；不确定项在 `params.note` 标 `【待校准】`。
3. 引擎 reload（`POST /api/engine/admin/reload` 或重启前端）→ `/api/engine/health` 确认 `dataVersion` 与 warnings。
4. 跑数据回归测试。
5. 模拟器与 MCTS 代码**不得**因数据更新而改动。

## 约定

- 接口字段统一 `camelCase`；请求 / 响应在引擎内以 TS 类型声明，前端用 TypeBox/AJV 校验。
- 弹窗用 `DialogBody` / `DialogForm`；禁止原生 `alert` / `confirm` / `prompt`；交互优先 `components/ui/*`。
- 图表用 ECharts 6；响应式断点 `min-[520px]:` / `min-[860px]:`。
- 引擎同构：纯逻辑不依赖 `fs` / DOM；Node 侧 loader（`data-node.ts`）与浏览器 Worker 均复用同一引擎。
- 不引入数据库、鉴权、云同步；存档 / 对手库存浏览器 `localStorage`。
- 凭证 / 密钥不入仓（本项目预期无需凭证）。
- 不新增依赖前先确认已在用；新增需说明理由。

## 端口

| 服务 | 端口 |
| --- | --- |
| Next.js 前端（内置 TS 引擎） | 26900 |

（避开参考项目 ShiGuZone 的 26841；原 Python 引擎 26901 已废弃。）
