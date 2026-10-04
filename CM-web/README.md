# CM-web · 收银台

SaaS 多商户点餐系统的**收银台**（Vue 3.5 + TypeScript + Vite + Pinia + Vue Router + VueUse + Element Plus + TanStack Vue Query）。
给门店收银员用：线下点单、收款、开台清台、打票。

## 开发

```bash
pnpm install --registry=https://registry.npmmirror.com
pnpm dev        # 端口与代理目标只在 vite.config.ts 里定义（默认 5175）
pnpm build      # vue-tsc -b && vite build
pnpm preview
```

本机 npm 官方源被网络中间人拦截，`.npmrc` 已固定 `registry=https://registry.npmmirror.com`。

## 只有收银权限的员工能登录

这是收银台与商家端最本质的区别：**登录入口本身带权限闸门**。

- 登录走 `POST /auth/cashier/login`（不是商家端的 `/auth/merchant/login`）。
- 后端在**密码验证通过之后**再校验该员工的角色是否含 `cashier:use`：
  顺序很重要 —— 先验密码再判权限，否则「这个账号存不存在」会从 403 与 401 的差别里泄露出去。
- 无权限时**不累加登录失败计数**：密码是对的，只是没这个角色，
  算作登录失败会让收银员试几次就被锁 10 分钟。
- 前端在路由守卫里**再挡一次**：拿商家端/小程序拿到的令牌直接塞进本站时，
  那种令牌能过 `/auth/profile` 但没有 `cashier:use`，守卫会清掉会话并跳回登录页。

角色与权限（`Api-Serve/src/common/constants/permission.ts`）：

| 角色 | `cashier:use` | 能做什么 |
| --- | --- | --- |
| owner / manager | ✅ | 全部（含开单、收款、退款、开台清台） |
| cashier | ✅ | 开单、收款、退款、开台清台、打票、看今日订单 |
| waiter | ❌ | 不能登录收银台（但可以开台清台 —— 在商家端 `MH-web` 的「桌位管理」里，那一档权限是 `table:operate`） |
| kitchen | ❌ | 不能登录收银台，也没有开台清台 |

账号由店长在商家端「员工管理」里创建，与商家端共用同一套账号密码。
演示数据里 `M10001` 下五个角色各有一个账号，收银台用 `cashier` / `Cashier@123`（或 `manager` / `Manager@123`）进。

## 收款：现金与收款码是「线下渠道」

收银台能**直接代收**的只有两种，它们在后端是支付域里的一等渠道（`cash` / `offline`）：

- **现金**：点一下即完成，界面提供「实收 / 找零」。
- **收款码**：顾客扫商户自己的收款码，收银员确认到账后点一下即完成。

这两种渠道与微信/支付宝走**完全相同**的链路（`POST /merchant/payments`）：
创建即 `succeeded`，随后由支付域统一把订单置为已支付、发取餐码、按抽佣比例生成分账单。
所以收银台的收款记录和在线支付共用同一张 `payment` 表、同一套状态机，
不存在「两处都在改订单支付状态」的分叉。

它们与在线渠道的三点不同，写在 `Api-Serve/src/modules/payment/constants/payment.constant.ts` 的 `OFFLINE_CHANNELS` 里：

1. 不需要平台开渠道开关、不需要商户进件 —— 所以**不出现在**平台端「支付渠道配置」与商家端「收款设置」里；
2. 没有渠道账单，**不参与对账**（不在 `RECONCILE_ENABLED_CHANNELS` 中）；
3. 资金没走渠道，平台无法在资金流里冻结抽佣，分账单金额天然为 0。

**在线渠道（微信/支付宝）在收银台不可直接代收**，界面上会显示但置灰，并说明原因：
收银台收微信/支付宝要走**付款码支付（被扫）**，需要单独的产品权限与真实渠道实现，
而当前项目只接了 `mock`（真渠道需资质）。正确做法是引导顾客扫桌上的二维码在小程序里自助支付，
付款结果在「今日订单」里核对。

## 页面

- **点单收银（`/cashier`）**：左分类 / 中菜品 / 右本单三栏。
  - 菜品有规格或加料时（后端 `needChoose` 标记）先弹选择框，避免把「大份加辣」记成基础份。
  - 本单里可以切就餐方式、选桌位（堂食必选）、登记人数、**按手机号认会员**。
  - **金额一律由后端算**：本单合计来自 `POST /merchant/cashier/orders/preview`（不落库），
    结账时再算一次，所以收银员报给顾客的价与最终落库的价必然一致。
  - 收款完成后弹「是否打印小票」，可选顾客小票 / 后厨小票。
- **桌位看板（`/tables`）**：卡片网格，空闲 / 用餐中一目了然，显示用餐时长与人数；
  可开台（登记人数）、清台、直接「去点单」（把桌位预置进本单）。
  - **清台有守卫**：桌上有未结账订单时后端拒绝，需收银员明确选择「强制清台」（顾客跑单是真实场景）。
  - 商家端 `MH-web` 的「桌位管理」列里也能看到同一份用餐状态并开台清台，
    两端读写的是 `store_table` 的同一个字段，不存在两份状态。
- **今日订单（`/orders`）**：只看当天；顶部是今日单数 / 营业额 / 待收款；
  支持按状态筛选与订单号过滤；可对未支付订单**继续收款**、打票、推进出餐状态、取消。

## 与其它端的关系

收银台**不重写任何业务逻辑**，只是已有能力的人机界面：

| 能力 | 后端接口 | 说明 |
| --- | --- | --- |
| 算价 | `ClientOrderPriceService` | 与顾客端共用同一份算价服务（会员价、活动价取低、打包费口径只此一份） |
| 建单 | `POST /merchant/cashier/orders` | 与顾客自助下单的区别见下 |
| 收款 | `POST /merchant/payments` | 支付域唯一入口 |
| 出餐流转 | `PATCH /merchant/orders/:id/status` | 与商家端同一套 |
| 打票 | `/merchant/print/*` + `src/utils/print/` | 与商家端同一套版面与出纸适配层（`utils/print/` 三个文件是同一份实现） |
| 开台清台 | `POST /merchant/tables/:id/open` \| `/close` | 桌位域 |

收银台建单与顾客自助下单的差异：

| | 顾客自助 | 收银台 |
| --- | --- | --- |
| 顾客身份 | 必须有会员档案 | 可散客（不享会员价） |
| 桌号来源 | 扫桌位码拿 token | 选桌位 ID |
| 优惠券 | 支持 | 不支持（线下核销走人工） |
| 初始状态 | `pending` 等商家接单 | `accepted` —— 收银员开单即等于商家接单 |

堂食下单时如果桌位还是空闲的，收银台会**自动补开台**，
避免出现「有订单但看板上桌位空闲」的假象。

## 接口约定

- 项目内**没有任何 `.env` / 运行时环境变量**：接口固定相对路径 `/api/v1`（见 `src/constants/api.ts`），
  图片固定相对路径 `/uploads`。后端地址只有 `src/request.ts` 一处，只影响本地 dev proxy。
- 统一响应体 `{ code, message, data, timestamp, requestId }` 在 `src/api/request.ts` 拆包；
  401 用 refreshToken 静默续期并重放原请求。
- **后端的列表接口一律分页**（`PageQueryDto`，`pageSize` 上限 100，超了直接 400）。
  收银台要「整店菜单一次看全」，所以 `src/api/order.ts` 里用 `collectAllPages()` 按页捞到 `total` 为止，
  界面拿到的就是数组 —— 别在界面里再判一次 `.list`。
- 登录态持久化在 `src/utils/auth-storage.ts`（VueUse `useLocalStorage`），
  localStorage 前缀是 `cm-web:`，与商家端分开，同域部署时不会互相覆盖。

## 目录结构

```
src/
├── api/            # 每个业务模块一个接口文件 + types/ 下的后端契约类型
├── components/     # 跨模块通用组件（分页、状态标签）
├── constants/      # 字典、权限、接口与存储常量
├── layouts/        # CashierLayout：顶栏 + 导航（无侧边栏，收银台要的是整屏点单）
├── router/         # 静态路由表 + meta + 登录与权限守卫（含收银权限二次校验）
├── stores/         # Pinia：auth（登录态与权限）、cart（本单：购物车 + 就餐方式/桌位/会员）
├── utils/          # auth-storage、format（含找零与用餐时长）、validate、print/（小票版面与出纸）
└── views/          # login / cashier（点单）/ table（桌位看板）/ order（今日订单）/ error
```

## 容器化部署

与另两个 Web 端一致：镜像自带 nginx，既托管 `dist` 静态产物，也把 `/api` 与 `/uploads` 反代到后端。
**构建产物里不含任何后端地址**（接口只用相对路径），换环境不用重新构建。

```bash
docker build -t ye-dc/cm-web:latest .
docker run -e API_UPSTREAM=http://api:8000 -e UPLOADS_UPSTREAM=http://api:8000 -p 8083:80 ye-dc/cm-web:latest
```

- `API_UPSTREAM`：后端 API 地址，容器编排里通常填服务名（`http://api:8000`）。
- `UPLOADS_UPSTREAM`：图片地址（桌位二维码、菜品图）。
- 网关已放开 `client_max_body_size 10m` 并配好 SPA history fallback。

完整部署流程见仓库根 `DEPLOY.md`。
