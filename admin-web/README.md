# Admin-web · 平台端管理后台

SaaS 多商户点餐系统的平台运营侧前端（Vue 3.5 + TypeScript + Vite + Pinia + Vue Router + VueUse + Element Plus + TanStack Vue Query），
与同仓库的商家端 `MH-web` 保持完全一致的工程约定与目录分层。

## 开发

```bash
pnpm install --registry=https://registry.npmmirror.com
pnpm dev        # 固定 127.0.0.1:5173，端口与代理目标只在 vite.config.ts 里定义
pnpm build      # vue-tsc -b && vite build
pnpm preview
```

本机 npm 官方源被网络中间人拦截，`.npmrc` 已固定 `registry=https://registry.npmmirror.com`；
`pnpm-workspace.yaml` 用于批准 `esbuild` / `vue-demi` 的构建脚本（包管理配置，非运行时 env）。

## 接口约定

- 项目内**没有任何 `.env` / 运行时环境变量**：接口地址固定为相对路径 `/api/v1`（见 `src/constants/api.ts`）。
- 开发环境由 `vite.config.ts` 中的 dev proxy 把 `/api` 转发到后端服务；生产环境用同域反向代理承接 `/api` 即可，构建产物无需任何改动。除 `vite.config.ts` 外，代码里不出现任何域名、主机或端口。
- 统一响应体 `{ code, message, data, timestamp, requestId }` 在 `src/api/request.ts` 的响应拦截器里拆包；401 使用 refreshToken 静默续期并重放原请求，并发时共享同一个刷新 Promise。
- 登录接口为 `POST /auth/platform/login`（平台账号无商户号）。

## 目录结构

```
src/
├── api/          # 每个业务模块一个接口文件（auth / merchant / merchant-insight / account / dashboard / audit / payment / mini-program）+ types/ 后端契约类型
├── components/   # 跨模块通用组件（状态标签、分页条、时间格式化、图片地址录入）
├── constants/    # 字典（商户状态/门店状态/订单状态/就餐方式/菜品状态/会员等级/员工角色/平台角色/审计动作）、菜单、权限点、接口与存储常量
├── layouts/      # DefaultLayout + 侧边菜单/顶栏/面包屑/改密码对话框
├── router/       # 静态路由表 + meta + 登录与权限守卫
├── stores/       # Pinia：auth（登录态与权限）、app（侧边栏状态）
├── utils/        # auth-storage（VueUse useLocalStorage）、format、validate
└── views/        # login / dashboard / merchant / expiring / payment / system / account / audit / error
```

## 页面与权限

| 页面 | 路由 | 权限点 |
| --- | --- | --- |
| 平台看板 | `/dashboard` | `platform:dashboard:read` |
| 商户管理 | `/merchant` | `merchant:read` + `merchant:create` / `merchant:update` / `merchant:audit` |
| 商户数据只读穿透 | 商户详情抽屉内 Tab | `platform:merchant:view` |
| 商户抽佣设置 | 商户管理「编辑」弹窗内 | `merchant:update`（运营无此权限，只有超管能改） |
| 到期预警 | `/expiring` | `merchant:read` |
| 支付渠道 | `/payment/channel` | `platform:payment:manage`（仅超级管理员） |
| 商户支付 | `/payment/merchant` | 查看 `platform:merchant-payment:read` / 审核启停 `platform:merchant-payment:audit` |
| 支付流水 | `/payment/flow` | `platform:payment:read` |
| 平台分账 | `/payment/profit-share` | `platform:payment:read` |
| 交易对账 | `/payment/reconcile` | `platform:payment:read` |
| 平台账号 | `/account` | `platform:account:manage` |
| 操作审计 | `/audit` | `platform:audit:read` |
| 小程序配置 | `/system/mini-program` | `platform:mini-program:manage`（仅超级管理员） |

`platform_admin` 拥有全部权限；`platform_operator` 只有 `merchant:read`、`merchant:audit`、
`platform:merchant:view`、`platform:dashboard:read`、`platform:audit:read`、
`platform:merchant-payment:read`、`platform:merchant-payment:audit`、`platform:payment:read`，
进入「平台账号」「支付渠道」「小程序配置」会被路由守卫重定向到 403。
菜单可见性与按钮 disabled 均由后端下发的 `permissions` 驱动；商户详情抽屉里的所有业务数据均为只读，不提供编辑入口。

支付相关三页的凭据口径：渠道密钥（APIv3 密钥、商户私钥、渠道公钥）只在「支付渠道」页写入，
后端加密存库并只回掩码，表单留空即沿用原值，界面上永远拿不到明文；
「商户支付」页展示的结算账号同样是后端脱敏值。审核驳回意见必填且商户端可见，历史意见由「操作审计」承接。

「小程序配置」（系统设置 → 小程序配置）沿用同一套只写不读口径，管理顾客微信小程序的 AppID / AppSecret：
AppID 明文回显可复制；AppSecret 只回掩码 `********` 与 8 位指纹，输入框占位即为掩码并提示「留空或保持掩码表示不修改」。
**提交时未改动就不下发 `appSecret` 这个 key**（后端把缺省当作沿用原值），传空串会真的清空密钥，
因此清空只能由「清空密钥」按钮显式触发并二次确认；覆盖已有密钥同样要二次确认，保存后的提示会给出改前/改后指纹便于核对。
右侧「当前生效配置」区分凭据来源（`database` 后台保存 / `env` 回落 `.env` 的 MINI_APP_ID、MINI_APP_SECRET / `none` 未配置），
`envFallbackAvailable` 时提示 .env 里有兜底值，`missingFields` 非空时顶部警告条列出缺项；
「立即自检」调 `POST /platform/mini-program-config/test`，成功绿、失败红并带检测时间。

「支付流水」是全平台资金只读视图（前端无任何写操作）：顶部为今日/累计交易额、累计退款额、
未完成与异常笔数五张统计卡，下方分「支付流水」「退款流水」两个标签页，共用关键字（商户名/编号、
支付单号、渠道交易号）、订单号、渠道、状态与日期区间筛选。
支付行可展开查看该支付单的渠道通知原始记录（按需拉取，含验签结果与报文），用于排障。
**金额口径**：交易额只统计已成功的支付单，退款单独统计、不冲抵交易额——冲抵之后看不出真实交易规模。

「平台分账」展示服务商模式下平台对每笔成功支付抽佣的流水：顶部为今日/累计抽佣、待解冻、
已解冻、解冻失败五张统计卡；列表把同一支付单的「平台侧 + 商户侧」两条分账记录合并为一行，
展示支付额、平台抽佣与商户结算（二者相加恰等于支付额）及抽佣比例快照；支持按商户、渠道、
状态、到期日、订单号筛选，双击行或点「详情」打开抽屉查看两侧各自的状态与解冻时间。
分账状态机与支付状态机相互独立：`pending → frozen → unfreezing → unfrozen / failed`，
解冻由后端定时任务按 T+1 自动执行，失败自动重试，重试耗尽置 `failed` 等人工介入。
分账单只在商户配置了 `profitShareRate`（>0）时生成，费率在生成时快照，事后改费率不影响历史账。

「商户管理 → 编辑」弹窗底部是**平台抽佣比例**，分「微信抽佣」「支付宝抽佣」两栏，取值范围 0 ~ 10%、
最多 4 位小数（与后端 `decimal(6,4)` 精度对齐），界面按百分比输入（填 `0.38` 即 0.38%）、
留空表示不修改、填 `0` 表示已定价为不抽佣。

抽佣是**商户 × 渠道**级设置，因此只有该商户已提交进件的渠道才可编辑 —— 其余渠道输入框置灰并提示
「请先在商户支付进件审核开通后再设置」。后端 `PATCH /platform/merchants/:id` 只写已存在的
`merchant_payment_config` 行，未进件的渠道直接返回 400，不做静默丢弃，避免运营误以为设置成功。
每次改动写入 `payment.merchant.profit_share_rate` 审计（含改前改后值与渠道名）；值与当前一致时不写入、
不产生审计。抽佣比例在每笔支付成功时快照进分账单，**修改只对之后的支付生效，历史分账单不受影响**。

「交易对账」展示每日渠道账与本地账的核对结果：一行 = 一个商户在一个渠道上的一天，
列表同时给出渠道账（笔数/金额/手续费）与本地账（笔数/金额/当日退款）以及**差额**与差异笔数金额，
顶部为最近对账日、已平账、有差异、账单未出、对账失败五张统计卡。
双击行或点「详情」打开抽屉查看差异明细：每条差异标明类型（本地缺单/渠道缺单/金额不一致/
交易号不一致/重复记账）、支付单号、双端金额、差额与处理说明。
「手动补跑」弹窗可对指定日期（默认为昨天）重算——它**只重算核对结果，不修改任何资金数据**。
对账由后端每日 02:00 自动执行前一自然日，账单未出齐的会自动重试；本页不做任何支付/资金写操作。
差异金额口径为「渠道 − 本地」的绝对值累加，本地当日退款单独列出、不冲抵交易额。
