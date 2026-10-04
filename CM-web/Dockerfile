# 刻意不写 BuildKit 的 syntax 指令（dockerfile:1）：BuildKit 自带的前端已覆盖本文件用到的全部语法
# （没有 --mount / --link / --checksum 这类需要外部前端的特性），而那行会让构建先去 Docker Hub
# 拉 14MB 的 docker.io/docker/dockerfile:1，国内网络下光这一步就能卡住十分钟。

# =============================================================================
# 收银台（CM-web）生产镜像
#
# 与另两个 Web 端同构：Node 编译静态产物 → nginx 托管 + 反向代理。
# 收银台跑在门店的触屏机上，与商家端分开成独立镜像，可以单独发版互不影响。
#
# 构建（在 CM-web 目录内）：
#   docker build -t ye-dc/cm-web:latest .
# 运行：
#   docker run -e API_UPSTREAM=http://api:8000 -p 8083:80 ye-dc/cm-web:latest
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

# pnpm-workspace.yaml 带着 allowBuilds（vue-demi 的 postinstall），漏掉会让依赖装不全
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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
