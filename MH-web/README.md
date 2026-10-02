# MH-web · 商家端管理后台

SaaS 多商户点餐系统的商家端前端（Vue 3.5 + TypeScript + Vite + Pinia + Vue Router + VueUse + Element Plus + TanStack Vue Query）。

## 开发

```bash
pnpm install --registry=https://registry.npmmirror.com
pnpm dev        # 端口与代理目标只在 vite.config.ts 里定义
pnpm build      # vue-tsc -b && vite build
pnpm preview
```

本机 npm 官方源被网络中间人拦截，`.npmrc` 已固定 `registry=https://registry.npmmirror.com`，`pnpm-workspace.yaml` 只用于批准 `vue-demi` 的 postinstall 脚本（包管理配置，非运行时 env）。

## 接口约定

- 项目内**没有任何 `.env` / 运行时环境变量**：接口地址固定为相对路径 `/api/v1`（见 `src/constants/api.ts`）。
- 开发环境由 `vite.config.ts` 中的 dev proxy 把 `/api` 转发到后端服务；生产环境用同域反向代理承接 `/api` 即可，构建产物无需任何改动。除 `vite.config.ts` 外，代码里不出现任何域名、主机或端口。
- 统一响应体 `{ code, message, data, timestamp, requestId }` 在 `src/api/request.ts` 的响应拦截器里拆包；401 使用 refreshToken 静默续期并重放原请求，并发时共享同一个刷新 Promise。

## 收款设置（`/payment`）

- 查看收款状态需 `payment:read`，提交或修改进件资料需 `payment:apply`（收银员默认只有查看权限，卡片只提供「查看资料」）。
- 微信支付按服务商模式建模：商户自行填写渠道方开通的 `sub_mchid` 并提交营业执照、结算账户等资料，平台运营审核通过后才生效；渠道密钥全部由平台保管，商家端不出现任何渠道密钥录入项。
- 结算账号后端只下发脱敏值，表单里留空即表示沿用原账号；费率与平台抽佣为只读展示，由平台在审核时确定。
- 已开通的渠道再次提交资料会触发重新审核，提交前有二次确认提示「审核期间该渠道可能停用」。
- 平台关闭某渠道总开关时，该渠道卡片的申请按钮禁用并提示联系运营，避免商户提交了也收不了款。

## 目录结构

```
src/
├── api/          # 每个业务模块一个接口文件 + types/ 下的后端契约类型
├── components/   # 跨模块通用组件（状态标签、分页、图片地址录入）
├── constants/    # 字典（订单状态/就餐方式/菜品状态/会员等级/角色/权限）、菜单、接口与存储常量
├── layouts/      # DefaultLayout + 侧边菜单/顶栏/面包屑/改密码对话框
├── router/       # 静态路由表 + meta + 登录与权限守卫
├── stores/       # Pinia：auth（登录态与权限）、app（侧边栏状态）
├── utils/        # auth-storage（VueUse useLocalStorage）、format、validate
└── views/        # login / dashboard / order / dish / category / member / staff / payment / store / error
```

页面数据统一用 TanStack Vue Query 获取，mutation 成功后 `invalidateQueries` 使列表与看板缓存失效；
按钮与菜单可见性由后端下发的 `permissions`（如 `dish:create`）驱动，路由 `meta.permissions` 做页面级拦截，无权限跳 403。
