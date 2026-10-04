# 刻意不写 BuildKit 的 syntax 指令（dockerfile:1）：BuildKit 自带的前端已覆盖本文件用到的全部语法
# （没有 --mount / --link / --checksum 这类需要外部前端的特性），而那行会让构建先去 Docker Hub
# 拉 14MB 的 docker.io/docker/dockerfile:1，国内网络下光这一步就能卡住十分钟。

# =============================================================================
# Api-Serve 生产镜像
#
# 分三个阶段：装全量依赖 → 编译 → 只带生产依赖的运行镜像。
# 这样最终镜像里没有 typescript / nest-cli / 测试脚本，体积和攻击面都小一截。
#
# 构建：
#   docker build -t ye-dc/api-serve:latest ./Api-Serve
# 运行（必须把配置以环境变量注入，镜像里刻意不含 .env）：
#   docker run --env-file ./deploy/.env.production -p 8000:8000 ye-dc/api-serve:latest
# =============================================================================

ARG NODE_IMAGE=node:22-alpine
ARG PNPM_VERSION=10

# ---------- 1. 依赖（含 dev，供编译用）----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# 国内构建走镜像源；需要时用 --build-arg NPM_REGISTRY=... 覆盖
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION
RUN npm config set registry "$NPM_REGISTRY" \
  && npm install -g "pnpm@${PNPM_VERSION}" \
  && pnpm config set registry "$NPM_REGISTRY"

# 只拷清单文件：源码变动不会让这一层缓存失效
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------- 2. 编译 ----------
FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm build

# ---------- 3. 生产依赖（不含 dev）----------
FROM deps AS prod-deps
WORKDIR /app
RUN pnpm install --frozen-lockfile --prod

# ---------- 4. 运行 ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production
# tini 作为 PID 1：Node 不会自动回收僵尸进程，也不把 SIGTERM 转成优雅退出，
# 容器停止时靠它把信号透传给应用，避免正在处理的支付回调被硬杀。
RUN apk add --no-cache tini

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
# 迁移脚本依赖它；生产执行迁移时用得到
COPY --from=builder /app/src/database ./src/database

# 本地存储驱动会往这里写图；对象存储驱动用不到，但留着保证目录存在且可写
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# 以非 root 运行：容器被攻破时拿不到 root，是云托管的基本要求
USER node

EXPOSE 8000

# 存活探针只问「进程还在吗」，不查数据库——依赖抖动不该触发容器重启
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||8000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
