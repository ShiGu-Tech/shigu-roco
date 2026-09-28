# ShiGuRock · 洛克王国世界 PVP 决策辅助工具

离线、单人的 PVP 对局辅助工具：**人工录入对局状态** → 纯 TS 引擎复刻官方回合结算并做 **MCTS 推演**（含贝叶斯对手 / 养成后验）→ Next.js 网页展示各动作预估胜率与推荐理由。

> 非外挂：不读取游戏画面、不自动操作游戏、运行时离线。引擎已并入前端同仓，无独立进程。

## 架构一览

```text
Next.js 前端 (127.0.0.1:26900)
  ├─ /api/engine/*   → 内置 TS 引擎（Node Route Handler，参数 + 现查图鉴）
  └─ Web Worker      → 浏览器内跑 MCTS，不阻塞主线程
        模拟器(MDP) + 机制扩展层 + MCTS + 贝叶斯对手 + 养成后验
                               │ 只读加载
        data/*.json（引擎参数） + data/registry/catalogs（现查图鉴）
```

## 目录

| 路径 | 说明 |
| --- | --- |
| `apps/web/src/modules/engine/` | TS 引擎：模拟器、机制扩展层、MCTS、贝叶斯对手、养成换算、API handler、Worker |
| `apps/web/` | Next.js 16 + React 19 + Tailwind v4 + shadcn/ui（对战台 / 详细录入） |
| `data/` | 引擎参数 JSON + 现查图鉴注册（`registry/catalogs/`；资源唯一来源） |
| `docs/` | 设计稿（唯一入口 `docs/README.md`） |
| `scripts/` | 环境初始化与一键开发脚本 |

## 快速开始

```powershell
# 1. 初始化：pnpm install
pwsh scripts/setup.ps1

# 2. 一键开发：启动前端（引擎内置）
pwsh scripts/dev.ps1
```

打开 http://127.0.0.1:26900 使用对战台。

## 当前能力边界

- 已支持：离线对战台、逐回合模拟、MCTS 推荐、对手行为与养成后验、对手库、养成录入。
- 已接入机制扩展基础设施：触发器、条件、效果命令、行动队列、状态事务和战斗事件。
- 具体精灵特性、复杂技能、印记、天气和技能池变更仍按实战规则逐项补齐，未支持效果会标记为 `unsupported-effect`。
- 唯一数据参考：[roco.world 中文站](https://roco.world/zh/)；精灵、技能、属性、说明、机制词条与图片均以中文站为准。具体战斗机制以实战确认和真机对拍为准。

## 自验

```powershell
pnpm check          # 前端 lint + typecheck + 引擎测试（vitest）
pnpm -F web lint
pnpm -F web typecheck
pnpm -F web test    # 引擎回归测试
```

## 数据维护

资源数据：`node scripts/sync-roco-world.mjs --register`（dev 在 26900）从 roco.world 同步并注册图鉴，注册即激活。引擎参数：改 `data/*.json` 并更新 `version` / `updatedAt`。重启前端或 `POST /api/engine/admin/reload`，模拟器与 MCTS 代码不改。详见 `docs/modules/数据层-设计-v0.1.md`。

## 文档

- 总览：`docs/项目全景手册.md`、`docs/项目状态.md`
- 架构：`docs/architecture/引擎TS化-设计-v0.1.md`
- 模块：`docs/modules/`（数据层 / 战斗模拟器 / 战斗机制事实 / 机制扩展层 / MCTS 决策 / 养成资质与对手库 / 对局辅助台 / 对战台）

工程约定见 `AGENTS.md`。

## 路线（MVP）

阶段 1 骨架与数据 schema → 阶段 2 最小模拟器 → 阶段 3 MCTS + 对手模型 → 阶段 4 网页 UI → 阶段 5（可选）爬虫自动解析 + 扩充数据 + NN 估值加速。
