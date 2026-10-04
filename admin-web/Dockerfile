# 刻意不写 BuildKit 的 syntax 指令（dockerfile:1）：BuildKit 自带的前端已覆盖本文件用到的全部语法
# （没有 --mount / --link / --checksum 这类需要外部前端的特性），而那行会让构建先去 Docker Hub
# 拉 14MB 的 docker.io/docker/dockerfile:1，国内网络下光这一步就能卡住十分钟。

# =============================================================================
# 平台端（admin-web）生产镜像
#
# 构建阶段用 Node 编译静态产物，运行阶段只留一个 nginx —— 前端最终就是一堆静态文件，
# 把 node 留在运行镜像里没有任何意义。
#
# 构建（在 admin-web 目录内）：
#   docker build -t ye-dc/admin-web:latest .
# 运行：
#   docker run -e API_UPSTREAM=http://api:8000 -p 8081:80 ye-dc/admin-web:latest
#
# 前端不含任何环境变量配置（见 DESIGN.md）：接口只用相对路径 /api/v1，
# 由下面的 nginx 反向代理到后端。所以同一份构建产物可以部署到任何域名。
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

# nginx 官方镜像会在启动时把 /etc/nginx/templates/*.template 做变量替换后写入 conf.d，
# 因此后端地址不需要重新构建镜像就能改
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=builder /app/dist /usr/share/nginx/html

# 后端地址。容器编排里通常就是服务名，例如 http://api:8000
ENV API_UPSTREAM=http://api:8000
# 商户上传的图片：本地存储驱动下与 API 同源；用对象存储/CDN 时指向对应地址
ENV UPLOADS_UPSTREAM=http://api:8000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
