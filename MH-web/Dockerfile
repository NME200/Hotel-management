# 刻意不写 BuildKit 的 syntax 指令（dockerfile:1）：BuildKit 自带的前端已覆盖本文件用到的全部语法
# （没有 --mount / --link / --checksum 这类需要外部前端的特性），而那行会让构建先去 Docker Hub
# 拉 14MB 的 docker.io/docker/dockerfile:1，国内网络下光这一步就能卡住十分钟。

# =============================================================================
# 商家端（MH-web）生产镜像
#
# 与 admin-web 同构：Node 编译静态产物 → nginx 托管 + 反向代理。
# 两端刻意各自独立成一个镜像，可以按各自的节奏发版，互不影响。
#
# 构建（在 MH-web 目录内）：
#   docker build -t ye-dc/mh-web:latest .
# 运行：
#   docker run -e API_UPSTREAM=http://api:8000 -p 8082:80 ye-dc/mh-web:latest
# =============================================================================

ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# ---------- 1. 构建静态产物 ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION=10
RUN npm config set registry "$NPM_REGISTRY" \
  && npm install -g "pnpm@${PNPM_VERSION}" \
  && pnpm config set registry "$NPM_REGISTRY"

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- 2. 运行 ----------
FROM ${NGINX_IMAGE} AS runtime

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=builder /app/dist /usr/share/nginx/html

ENV API_UPSTREAM=http://api:8000
ENV UPLOADS_UPSTREAM=http://api:8000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
