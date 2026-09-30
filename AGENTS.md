# AGENTS · ShiGuRock

洛克王国世界 PVP 决策辅助工具的工程约定。技术栈参考 `D:\ShiGuZone\main`，但按本项目「离线、单人、无数据库」的定位做了裁剪。

## 定位红线（任何改动都不得违反）

- **非外挂**：不读取游戏画面、不读内存、不抓包、不自动操作游戏、不联网（运行时）。
- **数据与代码解耦**：精灵 / 技能 / 印记 / 天气 / 属性全部来自 `roco.world/zh/` 同步注册的图鉴（`data/registry/catalogs/`，现查）；引擎参数（规则 / 养成 / 资产 / 机制）在 `data/*.json`。版本更新只改数据，不改代码。
- **唯一外部数据源**：`https://roco.world/zh/` 中文站。不得把临时导出包、`dist-share` 或其他镜像作为后续数据源；中文名称、说明、机制词条和图片优先保留中文站原始字段。
- **模拟器是固定规则，MCTS 是搜索模型**：不在 MCTS 里写游戏策略硬编码。

## 大功能流程（硬性）

- 新增领域模型或结构性改动，先在 `docs/modules/`（跨模块的放 `docs/architecture/`）建独立设计稿，经确认后再开发。
- 设计稿至少覆盖：定位与边界、设计原则、领域模型、接口 / 契约、关键决策、非目标、实施状态。
- 实施完成后回填同一设计稿，并同步 `docs/项目状态.md`（必要时 `docs/项目全景手册.md`）。
- 小改动（缺陷修复、样式、文案、小交互）不走设计稿。

## 目录与结构

```text
apps/web/src/modules/engine/  TS 引擎（模拟器 + MCTS + 贝叶斯 + 养成 + API/Worker）
apps/web/src/modules/pets/    精灵实例与仓库（PetInstance 外键绑定图鉴模板，面板现算；/warehouse）
apps/web/                     Next.js 16 前端
apps/web/public/data/         入仓静态包 bundle.json（浏览器 Worker 直接读，服务端导出）
data/                         引擎参数 JSON + 图鉴注册（registry/catalogs/）
docs/                         设计稿（索引进 docs/README.md）
scripts/                      setup / dev / 同步 / 静态包导出
```

- 前端：`@/*` → `apps/web/src/*`；业务按 `src/modules/<name>/` 组织，纯逻辑与展示分离。
- 引擎：`modules/engine/` 包内按 `types / rng / data / stats / effects / simulator / mcts / opponent / api / worker` 分层。
- 运行时资源只认激活图鉴（`data/registry/catalogs/`）；引擎参数只认 `data/*.json`；**无静态兜底**，缺激活图鉴直接报错。代码中不得出现精灵 / 技能 / 倍率等游戏数据魔法数字（算法常量除外）。

## 自验与命令

- 引擎：`pnpm -F web test`（vitest：图鉴归一化、机制注册 / 行动队列 / 事务结算）。
- 前端：`pnpm -F web lint && pnpm -F web typecheck`。
- 全量：`pnpm check`（= 前端 lint+typecheck + 引擎测试；由根 `package.json` 代理）。
- 数据改动：必须过引擎测试（`catalog.test.ts` 归一化 + `data.ts` 引用校验）；注册后经 `/api/engine/health` 确认 counts 与 warnings。
- 每次改动完成：跑 `pnpm check`，并在本地 `26900` 冒烟相关页面（引擎内置，无需单独启动）。

## 数据维护流程

1. 资源数据：`node scripts/sync-roco-world.mjs --register`（需 dev 在 26900 运行）从中文站同步并注册新版图鉴，注册即激活，并自动导出静态包；这是精灵 / 技能 / 印记 / 天气 / 属性的唯一来源。
2. 引擎参数：改 `data/{rules,stats,assets,mechanisms}.json`，更新 `version` / `updatedAt`；不确定项在 `params.note` 标 `【待校准】`。
3. 引擎 reload（`POST /api/engine/admin/reload` 或重启前端）→ `/api/engine/health` 确认 `dataVersion` 与 warnings。
4. 导出静态包：`pnpm static:export`（读 `GET /api/engine/bundle` 写 `apps/web/public/data/bundle.json`，**入仓**）；浏览器 Worker 优先读它。数据改动后必须重跑并提交。
5. 跑 `pnpm check`。
6. 模拟器与 MCTS 代码**不得**因数据更新而改动。

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
