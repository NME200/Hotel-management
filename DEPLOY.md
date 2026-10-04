# 生产部署指南

面向「云托管 / 容器服务」的部署说明。本地单机验证用仓库根的 `docker-compose.yml`，  
云上按镜像逐个服务部署，两者共用同一套镜像与配置。

---

## 一、部署拓扑

```
                        ┌──────────────────────────────┐
   浏览器 ──HTTPS──▶    │  admin-web  (nginx, 平台端)   │──┐
                        └──────────────────────────────┘  │
                        ┌──────────────────────────────┐  │
   浏览器 ──HTTPS──▶    │  mh-web     (nginx, 商家端)   │──┤  /api/v1
                        └──────────────────────────────┘  ├──────────▶  Api-Serve:8000
                        ┌──────────────────────────────┐  │                 │
   门店触屏 ──HTTPS──▶  │  cm-web     (nginx, 收银台)   │──┘                 ├─▶ MySQL 8
                        └──────────────────────────────┘                    └─▶ Redis 7
   小程序 ──HTTPS──────────────────────────────────────────────────────────▶ Api-Serve:8000
```

五个可部署单元，其中四个各出一个镜像：

| 服务  | 镜像                     | 说明                        |
| --- | ---------------------- | ------------------------- |
| 后端  | `Api-Serve/Dockerfile` | NestJS，监听 8000            |
| 平台端 | `admin-web/Dockerfile` | 静态站 + nginx 反向代理          |
| 商家端 | `MH-web/Dockerfile`    | 静态站 + nginx 反向代理          |
| 收银台 | `CM-web/Dockerfile`    | 静态站 + nginx 反向代理，门店触屏机上打开 |
| 小程序 | HBuilderX 打包           | 不走容器，见第七节                 |

**为什么前端各带一个 nginx**：前端的接口地址只用相对路径 `/api/v1`（`DESIGN.md` 硬性约定，  
前端不含任何环境变量），必须由同域的网关把 `/api` 转发到后端。所以每个前端镜像自带网关，  
按域名分别对外——`admin.example.com`、`merchant.example.com`、`cashier.example.com`  
各自独立发版、互不影响。收银台单独一个域名还有业务理由：一家店的触屏机可以只发收银台地址，  
不必把商家端入口暴露给收银员。

---

## 二、前置条件

1. **域名与 HTTPS**：三个前端域名 + 一个接口域名（或复用前端域名）。  
   小程序要求接口与图片域名必须是 **HTTPS 且已备案**，否则真机请求会被直接拒绝。
2. **数据库**：MySQL 8，`utf8mb4`。云上建议用托管实例，不要跑在容器里（容器里的 MySQL 一旦重建，数据就没了）。
3. **Redis**：7.x。限流计数、登录会话、定时任务锁都依赖它，是**硬依赖**——连不上服务起不来。
4. **对象存储**（多副本部署必需）：腾讯云 COS / 阿里云 OSS / MinIO 等 S3 兼容服务。

---

## 三、构建镜像

四个镜像都是自包含构建上下文，在各自目录内构建即可：

```bash
docker build -t ye-dc/api-serve:latest ./Api-Serve
docker build -t ye-dc/admin-web:latest  ./admin-web
docker build -t ye-dc/mh-web:latest     ./MH-web
docker build -t ye-dc/cm-web:latest     ./CM-web
```

国内构建默认走 `registry.npmmirror.com`，需要时覆盖：

```bash
docker build --build-arg NPM_REGISTRY=https://registry.npmjs.org -t ye-dc/api-serve:latest ./Api-Serve
```

镜像特性：后端多阶段构建（运行镜像不含 devDependencies）、以非 root 用户运行、内置 `HEALTHCHECK`、  
用 `tini` 作为 PID 1 以保证收到 SIGTERM 时优雅退出。

---

## 四、配置

复制模板并填写：`cp deploy/.env.production.example deploy/.env`

几个**必须注意**的点：

- **`ALLOWED_ORIGINS` / `ALLOWED_HOSTS`** 必须与真实访问地址完全一致（含协议、端口）。  
  漏填会让前端全部请求被 CORS 拒绝或返回 403。
- **`TRUST_PROXY`**：容器前面有网关或负载均衡时必须 ≥ 1。  
  留空时生产默认按 1 处理。**配错会导致全站用户被算作同一个来源**——限流额度被共享，  
  一次异常流量就能把正常用户一起拦掉，同时审计日志记录到的全是代理 IP。
- **`JWT_SECRET_KEY`** 与 **`CONFIG_ENCRYPTION_KEY`** 用随机值生成，不要手写：
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET_KEY
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # CONFIG_ENCRYPTION_KEY
  ```
  `CONFIG_ENCRYPTION_KEY` 一旦更换，数据库里已加密的支付渠道密钥将无法解密，必须重新录入。
- **`PROD_DB_HOST` / `PROD_DB_PASSWORD` / `PROD_REDIS_HOST` 是可选覆盖项**，  
  不填就使用 `DB_*` / `REDIS_*`。只维护一组配置即可。

---

## 五、数据库迁移

迁移**不在应用启动时执行**（多副本并发启动会互相锁表）。作为独立的一次性任务执行：

```bash
# 单机 compose：compose 里的 migrate 服务会自动先跑完，API 才启动
docker compose --env-file deploy/.env up -d --build

# 云上：用同一个镜像单独起一个任务
docker run --rm --env-file deploy/.env ye-dc/api-serve:latest \
  node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

发版顺序：**先跑迁移，再滚动更新 API 副本**。迁移脚本一律是向后兼容的加表/加列，  
旧版本副本在迁移后仍能正常工作，因此无需停机。

---

## 六、云容器服务部署要点

以腾讯云云托管 / 阿里云 SAE 这类「按镜像部署服务」的平台为例：

1. **服务划分**：`api`（8000）、`admin-web`（80）、`mh-web`（80）、`cm-web`（80）四个服务，  
   数据库与 Redis 用平台提供的托管实例。
2. **副本数**：
   - `api` 可多副本（限流与定时任务都基于 Redis，已做多副本安全处理）；
   - 三个前端按流量扩缩。收银台的量按门店数算，一家店一个标签页，通常 1~2 副本足够。
3. **图片存储**：多副本下 `UPLOAD_DRIVER=local` **会丢图**——上传请求落到 A 副本，  
   下一次图片请求被路由到 B 副本就是 404。必须选其一：
   - 设 `UPLOAD_DRIVER=s3` 接对象存储（推荐，见下）；
   - 或把共享文件存储（如腾讯云 CFS）挂到所有副本的 `/app/uploads`。
4. **对象存储配置**（`UPLOAD_DRIVER=s3`）：
   ```
   S3_BUCKET=ye-dc-uploads
   S3_ENDPOINT=https://cos.ap-guangzhou.myqcloud.com
   S3_REGION=ap-guangzhou
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_FORCE_PATH_STYLE=False          # 云厂商对象存储用虚拟主机风格；自建 MinIO 用 True
   S3_PUBLIC_BASE_URL=https://cdn.example.com
   ```
   同时把前端镜像的 `UPLOADS_UPSTREAM` 指向图片地址，或直接让 CDN 承接 `/uploads/`。
5. **健康探针**：
   - 存活探针 → `GET /api/v1/health/live`（不查依赖，避免数据库抖动引发容器反复重启）
   - 就绪探针 → `GET /api/v1/health/ready`（查数据库与 Redis，未就绪返回 503）
6. **优雅下线**：给容器配置 ≥ 15 秒的停止等待时间，让正在处理的支付回调跑完。

---

## 七、小程序发布

小程序不走容器，但上线前必须完成：

1. `UI-uniapp/api/request.uts` 里的 `BACKEND_ORIGIN` 改成 **https 正式域名**。
2. 微信公众平台后台配置：
   - **request 合法域名** → 接口域名
   - **downloadFile 合法域名** → 图片域名（`/uploads/...` 或 CDN）
3. 平台后台「小程序配置」里录入 AppID / AppSecret（加密入库，优先于环境变量）。
4. **桌位小程序码**：小程序发布后把 `MINI_ENV_VERSION` 从 `trial` 改回 `release`  
   （未发布时用 `release` 会因 page 不存在而报 41030，制不出码）；  
   `MINI_QR_PAGE` 必须是 `pages.json` 里真实存在的页面，默认 `pages/index/index`。  
   小程序尚未发布期间，商家端「桌位管理」里新建的桌位二维码会为空，发布后逐行「重制码」补生成。

---

## 八、上线前检查清单

- [ ] `APP_ENV=production`、`DEBUG=False`
- [ ] `JWT_SECRET_KEY`、`CONFIG_ENCRYPTION_KEY`、数据库/Redis 口令全部换成随机强口令
- [ ] `ALLOWED_ORIGINS`、`ALLOWED_HOSTS` 与实际域名一致
- [ ] `TRUST_PROXY` 与实际的网关层数匹配
- [ ] 迁移已在 API 滚动更新之前跑完
- [ ] 多副本部署时 `UPLOAD_DRIVER=s3` 或已挂共享存储
- [ ] 三个前端域名与接口域名均已配 HTTPS 证书
- [ ] 存活/就绪探针路径已配到编排平台
- [ ] 容器日志已接入日志采集（生产输出 JSON 行日志，可直接按字段建索引）
- [ ] 数据库已配置自动备份
- [ ] 小程序合法域名已配置、`BACKEND_ORIGIN` 已改为正式域名
- [ ] `MINI_ENV_VERSION=release`（小程序已发布）且 `MINI_QR_PAGE` 指向真实存在的页面
- [ ] 商家端「桌位管理」已建好桌位、二维码已生成并打印贴桌（未发布的桌位码为空是预期现象）
- [ ] 短信验证码已配好：平台后台「系统设置 → 短信配置」选通道并填齐 —— `阿里云短信`（AccessKey ID / Secret /  
  签名 / 模板 CODE）、`腾讯云短信`（SecretId / SecretKey / 短信应用 SdkAppId / 签名 / 模板 ID）、  
  `自定义短信网关`（网关地址 + 请求体 JSON 模板 + 鉴权头/密钥）三选一，签名与模板需云厂商审核通过、账户有余额。  
  保存后点「自检」：云厂商查的是签名/模板审核状态（不占发送额度），自定义通道只校验配置形状，  
  **必须再用自己的手机号在顾客登录页实收一条**才算通。  
  不配也能上线，顾客走「微信手机号一键登录」；但**生产环境不允许 `日志通道`**，那等于把登录凭据写进日志，  
  代码里已直接判为不可用。`.env` 的 `SMS_*` 只是首次部署兜底且只服务 `SMS_DRIVER` 那一个通道，  
  后台保存过就以数据库（`sms_config`）为准
- [ ] 收银台域名已配进后端 `ALLOWED_ORIGINS`，需要登录收银台的员工角色已含 `cashier:use`  
  （收银员/店长/老板默认有，服务员与后厨没有 —— 这是收银台的登录闸门）

---

## 九、当前**尚未完成**、上线前需要补齐的事项

以下不是工程化问题，但会影响「能否真正对外营业」，按优先级排列：

1. **真实支付渠道未接入**。当前只有 `mock` 渠道（且生产环境自动失效），  
   微信支付 / 支付宝的 provider 尚未实现。这意味着**生产环境下顾客无法完成支付**。  
   需要商户资质到位后，在 `Api-Serve/src/modules/payment/providers/` 下按  
   `PaymentProvider` 接口实现对应渠道。
2. **小程序真机联调与发布**未验证（页面已开发完成，需走微信审核发布流程）。
3. **微信支付 / 支付宝的 `notifyUrl`** 需配置为公网可达的 HTTPS 地址。
4. **等保/隐私合规**：隐私政策、用户协议、小程序备案。
