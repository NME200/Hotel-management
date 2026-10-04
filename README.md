# Hotel-management

SaaS 多商户点餐系统：`Api-Serve`（NestJS 后端）+ `admin-web`（平台端）+ `MH-web`（商家端）

- `CM-web`（收银台）+ `UI-uniapp`（顾客点餐小程序）。

## 前端连后端：地址在哪配

四个端各自只有一个文件写后端地址，换环境（比如后端不在这台机器上）就改这四处，别的全都不用动：

| 项目               | 配置文件                        | 内容                                         | 谁在用                                                  |
| ---------------- | --------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `MH-web`（商家端）    | `MH-web/src/request.ts`     | `BACKEND_ORIGIN = 'http://127.0.0.1:8000'` | `vite.config.ts` 的 dev proxy（`/api`、`/uploads`）      |
| `CM-web`（收银台）    | `CM-web/src/request.ts`     | 同上                                         | `vite.config.ts` 的 dev proxy（`/api`、`/uploads`）      |
| `admin-web`（平台端） | `admin-web/src/request.ts`  | 同上                                         | `vite.config.ts` 的 dev proxy（`/api`）                 |
| `UI-uniapp`（小程序） | `UI-uniapp/api/request.uts` | `BACKEND_ORIGIN` + `API_BASE_URL`          | `common/request.uts` 发请求、`common/format.uts` 拼图片绝对地址 |

三个 Web 端与小程序的机制不一样，这是有意为之：

- **Web 端请求只用相对路径** `/api/v1`（`src/constants/api.ts`），浏览器发出的地址永远是当前页面自己的域，  
  开发时由 vite proxy 按 `src/request.ts` 的地址转发，生产由同域反向代理承接。  
  所以 `request.ts` 里的 IP **只影响本地开发**，构建产物里不会出现它，换域名也不用重新打包。  
  `/uploads`（商户上传的图片与桌位二维码）走的是同一条规则，同样在 proxy 里转发。
- **小程序没有 proxy**，`uni.request` 与 `<image>` 只认绝对地址，所以 `api/request.uts` 必须写全  
  `http(s)://IP:端口`。上线前除了改这一行，还要在小程序后台把该域名配进  
  **request 合法域名**（接口）与 **downloadFile 合法域名**（`/uploads/...` 的图片），且必须是 https。

本机跑法：后端 `Api-Serve` 默认监听 8000（`.env` 里的 `APP_PORT`），  
`admin-web` dev 在 5173、`MH-web` dev 在 5174、`CM-web` dev 在 5175，  
三端的 proxy 都已指向 8000，直接 `pnpm dev` 即可。

## 容器化与上线

四个可部署单元各出一个镜像：`Api-Serve`（NestJS，8000）、`admin-web`、`MH-web`、`CM-web`  
（三个前端都是静态站 + nginx）。`UI-uniapp` 是小程序，由 HBuilderX 打包上传微信平台，不走容器。

三个前端的镜像各自自带 nginx，把 `/api` 与 `/uploads` 反代到后端；因为前端只用相对路径  
（见上文），构建产物里不含任何后端地址，换环境不用重新构建。网关地址由运行时的  
`API_UPSTREAM` / `UPLOADS_UPSTREAM` 环境变量决定。

```bash
# 单机全栈（MySQL + Redis + 后端 + 三个前端）
cp deploy/.env.production.example deploy/.env   # 填好后
docker compose --env-file deploy/.env up -d --build
```

完整的部署流程——环境变量、数据库迁移、健康探针、对象存储、上线前检查清单，  
以及**当前尚未完成、上线前需补齐的事项**——见 [`DEPLOY.md`](./DEPLOY.md)。
