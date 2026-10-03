# 构建：pnpm workspace → Next standalone。
# 模式参照 D:\ShiGuZone\main deploy\docker\Dockerfile，按本项目（离线 · 单人 · 无数据库）裁剪：
#   无 officecli 构建上下文 / 无需 apt / 公开依赖免 secret（.npmrc 指向 npmmirror，已在仓内）。
FROM node:26-slim AS builder
WORKDIR /workspace
ARG PNPM_VERSION=11.8.0
# 仓内 .npmrc（registry=npmmirror）供 npm 全局装 pnpm 与后续 pnpm install 同源
COPY .npmrc /root/.npmrc
RUN npm install --global "pnpm@${PNPM_VERSION}" && pnpm --version
# 只拷清单先装依赖：lockfile 不变则安装层走缓存（pnpm store 进 BuildKit cache mount）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && pnpm install --frozen-lockfile
COPY . .
ARG APP_VERSION=0.0.0
ARG APP_BUILT_AT=
ENV APP_VERSION=${APP_VERSION} APP_BUILT_AT=${APP_BUILT_AT} NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
RUN pnpm build

# 运行：standalone 单进程。data/ 不入镜像（图鉴注册 ~526MB），由 compose 挂 ./data。
FROM node:26-slim AS runner
WORKDIR /app
ARG APP_VERSION=0.0.0
ARG APP_BUILT_AT=
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 PORT=3000 TZ=Asia/Shanghai \
    APP_VERSION=${APP_VERSION} APP_BUILT_AT=${APP_BUILT_AT} \
    ROCO_DATA_DIR=/app/data
COPY --from=builder /workspace/apps/web/.next/standalone ./
# Next 16 standalone 对 pnpm 的 @swc/helpers 追踪不完整，显式覆盖完整包（与 main 同因同版）
COPY --from=builder /workspace/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers ./node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public ./apps/web/public
# data 挂载点：图鉴注册与引擎参数走宿主目录（同步图鉴 / 工作台写回无需重建镜像）
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
