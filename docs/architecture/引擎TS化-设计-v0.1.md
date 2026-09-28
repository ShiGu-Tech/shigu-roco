# 引擎 TS 化（并入 Next.js + Web Worker） · 设计 v0.1

> 文档状态：设计 ✅ v0.1 · 代码 ✅ · 验证 ✅ · 生产 ✅

## 1. 定位与边界

把原 Python/FastAPI 引擎（模拟器 + MCTS + 贝叶斯对手）**等价重写为纯 TypeScript**，并入 `apps/web` 单一仓库，去掉独立引擎进程与 26901 端口。**算法路线不变**：仍是「MDP 环境 → MCTS(UCB1) → 贝叶斯对手」，只换实现语言与运行位置。

不在本文范围：养成资质 / 对手库的领域建模（见《养成资质-设计》）；UI 交互（见《对战台》《对局辅助台》稿）。

## 2. 设计原则

1. **零行为漂移**：所有原 Python 测试用例迁移为 TS 测试，逐条等价；确定性（同 seed 同结果）必须保持。
2. **纯函数核心 + 薄外壳**：引擎不依赖 DOM、不依赖 `fs`（数据加载拆成可注入的 loader），便于在 Node（API Route）与浏览器（Web Worker）两端复用。
3. **可复现 PRNG**：不使用 `Math.random()`，统一 `mulberry32(seed)`，从根状态派生各阶段随机流。
4. **契约不变**：`/api/engine/*` 的请求 / 响应 JSON 形状与旧引擎保持一致，前端调用零改动（新增字段向后兼容）。
5. **数据驱动不回退**：游戏数值仍在 `data/*.json`，代码不含游戏魔法数字。

## 3. 运行架构

```text
┌──────────────────────── 浏览器 127.0.0.1:26900 ────────────────────────┐
│  Next.js 16 App Router                                                 │
│  ├─ 页面（/ 对战台、/record 详细录入）                                  │
│  ├─ /api/engine/[...path]  → 直接调用 TS 引擎（Node runtime，读 data/） │
│  └─ Web Worker（engine.worker.ts）→ 在浏览器跑 MCTS，避免卡主线程       │
└────────────────────────────────────────────────────────────────────────┘
        │ 同构引擎模块 src/modules/engine/**（Node / Worker 共用）
        ▼
  data/*.json（进程内读盘；Worker 侧经 /api/engine/bundle 注入）
```

- **默认路径（服务端）**：`/api/engine/recommend`、`/simulate/*`、`/catalog`、`/health` 全部由 Next Route Handler 直接执行 TS 引擎，进程内读 `data/`。
- **加速路径（Worker）**：前端把 `/api/engine/bundle` 取回的全量数据交给 Web Worker，在客户端跑 `recommend`，省去每次推演的往返与 Node 主线程占用；不可用时回退服务端。
- **删除**：`engine/` 整个 Python 包、`scripts/engine-dev.ps1`、根 `engine:*` 脚本、`pnpm-workspace.yaml` 的 `engine` 项。

## 4. 模块布局（`apps/web/src/modules/engine/`）

```text
engine/
├─ index.ts            # 公共出口
├─ types.ts            # 领域模型 + 数据层类型（对应 models.py / config.py）
├─ rng.ts              # mulberry32 + uniform / bool / pick / weightedPick
├─ data.ts             # buildBundle(原始 JSON) + typeMultiplier + 引用校验
├─ data-node.ts        # Node 侧 loader（读 data/*.json）
├─ stats.ts            # 养成资质换算（见《养成资质-设计》）
├─ effects/
│  ├─ damage.ts        # computeDamage（对应 effects/damage.py）
│  ├─ interpreter.ts   # ops / when DSL（对应 effects/interpreter.py）
│  └─ index.ts
├─ simulator/
│  ├─ battle.ts        # Simulator（对应 simulator/battle.py）
│  └─ marks.ts         # 印记结算（对应 simulator/marks.py）
├─ mcts/
│  └─ search.ts        # MCTS + UCB1（对应 mcts/search.py）
├─ opponent/
│  ├─ bayes.ts         # Dirichlet–Multinomial A/D/S（对应 opponent/bayes.py）
│  ├─ training.ts      # 对手养成度后验（新增）
│  └─ library.ts       # 对手库结构 + 合并（新增）
├─ api/
│  └─ handlers.ts      # 路由逻辑（catalog/health/recommend/simulate/observe）
└─ worker/
   ├─ engine.worker.ts # Worker 入口（接收 bundle + 请求，回结果）
   └─ client.ts        # 前端 Worker 封装（懒加载 + 回退）
```

## 5. 关键决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 引擎落点 | 并入 `apps/web/src/modules/engine/` | 单语言单进程，类型与前端共用，免 26901 与 CORS |
| 数据加载 | `data.ts` 纯函数 + `data-node.ts` Node loader | 同构：Worker 端由 bundle 注入，不碰 `fs` |
| 随机 | mulberry32 | 无依赖、可复现，替代 `random.Random` |
| 校验 | 复用前端已有 TypeBox/AJV 声明接口；数据层沿用「引用完整性 + warning 不崩」 | 与旧 Pydantic/`load_data` 语义对齐 |
| 测试 | Node 内置 `node --test` 跑 `.ts`，或 vitest | 先以 Node test runner 零依赖跑通；如需快照/覆盖再引入 vitest |
| 热重载 | 保留 `POST /admin/reload`（清模块级缓存） | 契约不变 |

## 6. 契约映射（旧 → 新）

| 旧 (Python) | 新 (TS) | 备注 |
| --- | --- | --- |
| `GET /health` | `handlers.health()` | 字段同 |
| `GET /catalog` | `handlers.catalog()` | 字段同，新增 `stats` 段 |
| `POST /recommend` | `handlers.recommend(body)` | 字段同，`options` 扩展对手库 / 养成 |
| `POST /simulate/turn` | `handlers.simulateTurn(body)` | 字段同 |
| `POST /simulate/forced-switch` | `handlers.forcedSwitch(body)` | 字段同 |
| `POST /simulate/leader` | `handlers.leader(body)` | 字段同 |
| `POST /opponent/observe` | `handlers.observe(body)` | 字段同，可写入对手库 |
| `POST /admin/reload` | `handlers.reload()` | 清缓存 |
| 新增 `GET /bundle` | `handlers.bundle()` | Worker 用：全量原始 JSON |

## 7. 验证

- 迁移原 23 项 pytest 为等价 TS 用例（数据 / 伤害 / 印记 / 结算 / MCTS 复现）。
- 迁移期若需对拍，可临时保留旧引擎跑同一批输入比对；确认一致后按用户决定删除 Python。
- 冒烟：`pnpm check`（lint + typecheck + 引擎测试）与 `pnpm -F web build`；本地启动后 `/`、`/record`、`/api/engine/health`、`/api/engine/recommend` 跑通。

## 8. 非目标

- 不改算法与输出语义。
- 不引入数据库 / 鉴权 / 云同步。
- 不做服务端并行 MCTS（Worker/多进程留待后续）。

## 9. 实施状态

设计 ✅ v0.1 / 代码 ✅ / 验证 ✅ / 生产 ✅。
- 引擎实现：`apps/web/src/modules/engine/`（types/rng/data/data-node/stats/effects/simulator/mcts/opponent/api/worker）。
- 契约入口：`app/api/engine/[...path]/route.ts`（health / catalog / bundle / recommend / simulate/* / opponent/observe / admin/reload）。
- Worker：`modules/engine/worker/engine.worker.ts` + `client.ts`；前端 `battle/client.ts` 优先走 Worker，失败回退 Route Handler。
- 测试：vitest 27 项通过；`pnpm -F web build` 通过；`pnpm check` 通过。
- 已删除：`engine/` Python 包、`scripts/engine-dev.ps1`、根 `engine:*` 脚本、`pnpm-workspace.yaml` 的 `engine` 项、`.gitignore` 的 Python 段。
