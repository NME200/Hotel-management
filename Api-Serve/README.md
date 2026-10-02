# Api-Serve

SaaS 多商户点餐系统后端：NestJS 11 + TypeORM 0.3 + MySQL 8 + Redis。

## 环境要求

- Node.js >= 20.11（本项目实测 v24）
- MySQL 8.x、Redis 6+
- pnpm 10+

## 快速开始

```bash
pnpm install            # .npmrc 已指向 npmmirror
# 先手动建库一次（见下方说明）
pnpm migration:run      # 建表
pnpm db:seed            # 灌演示数据（幂等，已存在则跳过）
pnpm start:dev          # http://localhost:8000/api/v1 ，接口文档 /docs
```

MySQL 没有 `CREATE DATABASE` 的 ORM 写法，而本项目禁止在后端文件里出现 SQL，
因此库需自行创建一次（库名取 `.env` 的 `DB_NAME`）：

```sql
CREATE DATABASE IF NOT EXISTS `APi-Serve` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

## 演示账号

| 端 | 接口 | 账号 |
| --- | --- | --- |
| 平台端 | `POST /api/v1/auth/platform/login` | `admin` / `Admin@123456` |
| 平台运营 | 同上 | `operator` / `Operator@123456`（无开通商户与账号管理权限） |
| 商家端 | `POST /api/v1/auth/merchant/login` | 商户号 `M10001` + `boss` / `Boss@123456` |
| 隔离验证 | 同上 | 商户号 `M10002` + `boss` / `Boss@123456` |

`M10001` 为川味小馆（5 分类 / 10 菜品 / 4 会员 / 26 订单），`M10002` 为江南面馆，
两库数据互不可见，可用来验证租户隔离。

## 平台端接口

| 分组 | 接口 | 权限点 |
| --- | --- | --- |
| 看板 | `GET /platform/dashboard/overview` | `platform:dashboard:read` |
| 商户 | `GET/POST /platform/merchants`、`GET/PATCH /platform/merchants/:id`、`PATCH /:id/status` | `merchant:read/create/update/audit` |
| 到期预警 | `GET /platform/merchants/expiring?days=30` | `merchant:read` |
| 只读穿透 | `GET /platform/merchants/:id/{statistics,dishes,orders,members,staffs}` | `platform:merchant:view` |
| 平台账号 | `GET/POST /platform/accounts`、`PATCH /:id` | `platform:account:manage` |
| 操作审计 | `GET /platform/audits`、`GET /platform/audits/actions` | `platform:audit:read` |

只读穿透直接复用商家端 service（只把租户键从登录态换成路径参数 + 商户存在性校验），
两端字段结构因此不会漂移；平台端对商户数据一律只读，写操作仍只能在商家端发生。

**唯一的例外是抽佣比例**：`PATCH /platform/merchants/:id` 的 body 可带
`profitShareRates: { wechat?: number, alipay?: number }`，平台端由此直接改写
`merchant_payment_config.profit_share_rate`。它只能在平台侧配置（商家端只展示），
取值 0 ~ 0.1、最多 4 位小数，与 `decimal(6,4)` 精度对齐。
没有对应进件行的渠道直接返回 400 而非静默跳过；值未变化时不写入、不产生审计。
抽佣比例在支付成功时快照进 `profit_share.rate`，因此改配置**只影响之后的支付，历史分账单不变**。
`GET /platform/merchants/:id` 会额外下发 `commissions: [{ channel, channelLabel, configured,
profitShareRate, status }]`，固定含微信与支付宝两条，`configured=false` 表示该渠道尚未进件、
此时不可设置抽佣。该操作记入审计动作 `payment.merchant.profit_share_rate`（含 `from` / `to`）。

## 支付模块

采用**微信支付服务商模式 + 支付宝**设计，第三方渠道凭据到位前先用模拟渠道跑通全链路。

**金额一律以「分」为整数存储计算**（`amount_cents`），`decimal` 金额只用于展示，
进出渠道都走 `toCents()` / `toYuan()`，避免浮点误差在退款和对账时凑不平。

| 表 | 作用 |
| --- | --- |
| `payment` | 支付单，`payment_no` 即发给渠道的 `out_trade_no`（全局唯一，幂等键） |
| `payment_refund` | 退款单，支持部分退款，累计不超原额 |
| `payment_notify_log` | 渠道通知原始记录，`(channel, notify_id)` 唯一索引天然去重 |
| `payment_channel_config` | 渠道级配置：总开关与渠道凭据，覆盖 `.env` 默认值 |
| `merchant_payment_config` | 商户进件配置：`sub_mchid`、结算账户、费率抽佣与进件状态 |
| `profit_share` | 分账单：一笔成功支付拆成「平台抽佣」+「商户结算」两条接收方记录，独立状态机 |
| `payment_reconcile` | 对账台账：一行 = 商户 × 渠道 × 自然日，渠道账与本地账的汇总核对结果 |
| `payment_reconcile_detail` | 对账差异明细：一笔对不上的业务单，含差异类型、双端金额与处理说明 |

`order_info.pay_status` 与出餐状态机 `status` **刻意分开**：钱和出餐进度是两条独立状态机，
混在一起迟早对不上账。支付成功只改 `pay_status`，不推进出餐状态。

**接口**

| 接口 | 权限点 |
| --- | --- |
| `POST /merchant/payments` 为订单发起收款（返回客户端调起参数） | `payment:create` |
| `GET /merchant/payments` 支付流水分页 | `payment:read` |
| `GET /merchant/payments/:paymentNo` 查单（未支付时顺带向渠道查一次） | `payment:read` |
| `GET /merchant/payments/order/:orderId`、`.../refunds` | `payment:read` |
| `POST /merchant/payments/order/:orderId/refund` 退款 | `payment:refund` |
| `POST /notify/{wechat\|alipay\|mock}` 渠道异步通知 | 公开，靠验签保护 |
| `GET /platform/payments`、`/summary`、`/refunds`、`/:paymentNo`、`/:paymentNo/notifies` 全平台支付流水（只读） | `platform:payment:read` |
| `GET /platform/profit-shares`、`/summary`、`/:shareNo` 全平台分账（只读） | `platform:payment:read` |
| `GET /platform/reconciliations`、`/summary`、`/:reconcileNo` 交易对账（只读） | `platform:payment:read` |
| `POST /platform/reconciliations/run` 手动补跑对账（重算核对结果，不改资金数据） | `platform:payment:read` |

顾客小程序自助支付接口（`/client/payments`）随小程序登录一起接入，届时复用同一套 `PaymentService`。

**分账（服务商模式平台抽佣）**

支付成功进入 `markOrderPaid` 后，若该商户该渠道配置了 `profitShareRate`（>`merchant_payment_config`），
按 `支付额 × 费率` 取整生成两条 `profit_share`（平台抽佣 + 商户结算，二者相加恰等于支付额），
费率落库快照——事后改费率不影响历史账。生成受 `(payment_id, receiver_type)` 唯一索引保护，重复/并发不叠加。

状态机 `pending → frozen → unfreezing → unfrozen / failed` 与支付状态机相互独立：
落库后立即向渠道下发分账指令（`PaymentProvider.profitShare`）置 `frozen` 并回填 `channel_share_id`；
`PaymentScheduler` 每 10 分钟扫一次到期（`unfreeze_at`，默认 T+1）的分账单逐笔解冻（`unfreezeShare`），
单笔失败累加 `retry_count` 并按 5 分钟退避重试，连续 3 次失败置 `failed` 等人工介入。
两个渠道能力（`profitShare` / `unfreezeShare` / `downloadBill`）都是 `PaymentProvider` 的可选方法，渠道不支持时保持 `pending`。

**交易对账（本地账 vs 渠道账）**

粒度是**商户 × 渠道 × 自然日**（`merchant_id + channel + trade_date` 唯一索引），
不是「全平台 × 日」——渠道账单本身按子商户号出，且差异必须落到具体商户才有人能处理。

- 每日 `02:00` 对前一自然日发起核对（Redis 抢锁），账单没出齐的台账转 `pending_bill`，
  由每 30 分钟的补跑任务继续推进（10 分钟退避、最多 5 次，超限转 `failed`）。
- 逐笔关联键用 `payment_no`（渠道回填的 `out_trade_no`），比渠道交易号可靠——后者在部分渠道会因重试变化。
- 差异分五类：`missing_local`（渠道有本地没有）、`missing_channel`（本地有渠道没有）、
  `amount_mismatch`、`trade_no_mismatch`、`duplicate_entry`。分类而不是笼统一句"金额不一致"，
  因为不同类型对应完全不同的处理动作。
- 差异金额按「渠道 − 本地」记（正负号有意义），台账汇总用绝对值累加。
- 本地账只统计**当日成功支付**；当日退款额单独一列**不冲抵交易额**——冲抵后差异会被退款掩盖。
- 重跑对账是常规操作：台账按唯一索引 UPSERT，差异明细整体替换（`(reconcile_id, channel, out_trade_no)` 唯一兜底），
  重复补跑不会累积重复差异。
- `downloadBill(billDate, context?)` 的第二个参数是**可选的本地参考账目**：`mock` 渠道是无状态模拟器
  （内存交易表只在单进程内有效，而对账往往跑在另一个进程），不传它会返回空账单，
  导致本地每笔支付都被误判成 `missing_channel` 假差异。真实渠道实现忽略该参数即可。
- 平台侧唯一的写操作就是「手动补跑」——它只**重算核对结果**，不修改任何支付/分账/资金数据。

**支付配置**（渠道级由平台保管，商户级走「商户提交 + 平台审核」）

| 接口 | 权限点 |
| --- | --- |
| `GET/PUT /platform/payment-channels[/:channel]` 渠道开关与凭据 | `platform:payment:manage` |
| `POST /platform/payment-channels/:channel/test` 连通性自检 | `platform:payment:manage` |
| `GET /platform/merchant-payment-configs`、`.../summary`、`.../merchant/:merchantId` | `platform:merchant-payment:read` |
| `POST /platform/merchant-payment-configs/:id/audit` 通过/驳回（驳回意见必填，商户端可见） | `platform:merchant-payment:audit` |
| `PATCH /platform/merchant-payment-configs/:id/status` 启停 | `platform:merchant-payment:audit` |
| `GET /merchant/payment-configs[/:channel]` 收款状态 | `payment:read` |
| `POST /merchant/payment-configs/apply` 提交/修改进件资料 | `payment:apply` |

- 生效优先级 **数据库 > `.env`**：平台在后台保存后立即生效，不改环境变量、不重启服务。
  渠道凭据用 AES-256-GCM 加密存库（主密钥 `.env` 的 `CONFIG_ENCRYPTION_KEY`，32 字节），
  读取接口只回掩码，写入留空表示沿用原值——密钥明文从不经过前端。
- 商户的结算账号同样加密存储，对外只下发 `6222****8888` 形式的脱敏值。
- 进件状态机 `not_applied → pending_audit → enabled / rejected`，`enabled ⇄ disabled`；
  已开通渠道再次提交资料会回到 `pending_audit` 并清空上一次的审核结论，避免「待审核 + 上次审核人」这种混合状态。
- 两道开关叠加才真正能收款：平台渠道总开关（`channelOpen`）+ 商户该渠道 `enabled`。
  平台关掉渠道后，商户端申请按钮直接禁用，已开通的商户也发起不了支付。

**可靠性设计**

- 回调顺序固定：验签解析 → 通知落库去重 → 金额核对 → 状态机 CAS → 按渠道格式应答。
  同一 `notify_id` 重复投递直接回成功，让微信停止那 15 次 / 24h4m 的重试。
- 状态流转用条件更新（`WHERE status IN ('created','paying')`）+ 判断 `affected`，
  并发或重复通知都不会重复入账。
- 通知金额与支付单金额不符一律拒绝并入日志——这是防伪造通知的关键。
- 回调不可靠，所以有两条兜底：客户端轮询 `GET /merchant/payments/:paymentNo` 会主动查单；
  定时任务每分钟「查单纠偏 + 关闭超时支付单」（Redis 抢锁，多实例只有一个节点跑）。
- 关单前先查一次渠道，避免"已支付但回调丢失"的单被误关。

**接真渠道**：在 `src/modules/payment/providers/` 下新增 `wechat.provider.ts` / `alipay.provider.ts`
实现 `PaymentProvider` 五个方法（create/query/close/refund/parseNotify + buildAck），
在 `PaymentProviderRegistry` 构造里注册即可，业务主流程零改动。
凭据可以写在 `.env` 第 6 节，也可以由平台在后台「支付渠道」页保存（后者优先）；
缺凭据时 `isReady()` 为 false，下单会明确提示"尚未完成配置"而不是半途报错。
注意 `main.ts` 已开启 `rawBody: true`：微信 V3 验签必须用原始报文，JSON 重新序列化会必然验签失败。

**上线前还缺**：调用微信/支付宝官方进件 API 自动拿 `sub_mchid`（当前是商户自填特约商户号 + 平台人工审核）、
真实微信/支付宝 provider（需资质，目前只有 mock 渠道就绪）。

## 顾客端（微信小程序）接口

小程序是**一个 appid 服务全部商户**的 SaaS 形态，所以每个请求都要先「定店」：
扫码进来的 `scene`（形如 `m=M10001`）决定门店，没有 scene 就落到门店列表由顾客自己选。
定店与租户校验集中在 `ClientMerchantGuard`，业务代码不再重复判断。

| 分组 | 接口 | 登录要求 |
| --- | --- | --- |
| 门店 | `GET /client/stores`、`GET /client/context?merchantCode=` | 公开 |
| 菜单 | `GET /client/menu`、`/client/dishes/recommend`、`/client/dishes/search`、`/client/dishes/:id` | 公开 |
| 登录 | `POST /client/auth/login`（wx.login 的 code + 门店编号）、`/refresh`、`/logout`、`GET /client/auth/me` | 前两个公开 |
| 会员 | `GET /client/member`、`/member/center`、`PATCH /member/profile` | 顾客令牌 |
| 优惠券 | `GET /client/coupons/claimable`（公开）、`/coupons/mine`、`/coupons/counts`、`POST /coupons/claim`、`/coupons/redeem` | 除领券中心外需顾客令牌 |
| 订单 | `POST /client/orders/checkout`、`POST /client/orders`、`GET /client/orders`、`GET /client/orders/:orderNo`、`POST /client/orders/:orderNo/cancel` | 顾客令牌 |
| 支付 | `GET /client/payments/channels`、`POST /client/payments`、`GET /client/payments/:paymentNo`、`/payments/order/:orderNo` | 顾客令牌 |
| 平台 | `GET/PUT /platform/mini-program-config`、`POST .../test` | `platform:mini-program:manage`（仅 admin） |

**令牌与权限**：顾客令牌与后台令牌同一套签发、Redis 会话与刷新机制，只是
`userType = client`、角色 `member`、权限集合恒为空。因此后台接口靠 `@Permissions`
天然挡住顾客令牌，反过来 `/client` 受保护接口用 `ClientSessionGuard` 挡住后台令牌
（报「该接口仅顾客登录态可访问」），两端的 ID 不会互相冒用。
`AuthService.loadProfile` 也显式拒绝 client 类型，避免顾客 ID 被当成员工 ID 查。

**小程序凭据**（`mini_program_config`，全局一行）：`app_secret_encrypted` 用
AES-256-GCM 密文入库，主密钥仍是 `.env` 的 `CONFIG_ENCRYPTION_KEY`；读取接口只回
掩码 + 8 位指纹，平台后台留空或回传掩码都表示「不修改」。数据库没配时回落
`.env` 的 `MINI_APP_ID` / `MINI_APP_SECRET`。**没有配置就登录不了**——
后端不提供任何模拟登录分支，返回的是「请到平台后台『小程序配置』填写」这类可执行提示。

**金额一律后端计算**（DESIGN.md 的重中之重）：下单与结算预览共用
`ClientOrderPriceService.price()`，只接受「点了什么」（菜品/规格/加料/数量），
请求体里任何金额字段都被 `ValidationPipe({ whitelist: true })` 丢弃。全链路按「分」算，
落库时才转元。口径固定三条：会员价按「基础价 − 会员价」的立减额生效（选大份也减同一额度）；
打包费按份收、外送另收固定配送费、堂食两者为 0；优惠券的门槛与抵扣只作用于菜品金额。

**下单的并发与一致性**：先算价再开事务，同一事务内写订单 + 明细快照 + 券核销 + 扣库存。
券核销用条件更新（`WHERE status='unused' AND valid_to>=now`）判断 `affected`，
并发抢同一张券只有一个能成；订单取消会把券放回顾客口袋并按明细还原库存。
取餐码在「同商户同一天」内唯一，重号最多重试 20 次。

**成长值**（`member.growth_value`）：唯一写入口是 `MemberGrowthService`（`modules/member-growth/`），
商家端订单完成时调用它，顾客端补手机号/首次用券也走它。等级由阈值推导
（绿卡 0 / 银卡 2000 / 金卡 5000 / 钻石 12000），会员日（每月 8/18/28 日）消费成长值翻倍。
成长任务**没有「点击领取」接口**——奖励在计数器正好达标的那一刻由服务端发一次，
前端只报进度，避免刷奖。

**演示数据**：`pnpm db:seed` 之后再跑 `pnpm seed:client-demo`（券模板 6+1 条、
会员券 17 张覆盖未使用/已使用/已过期、4 个会员的成长值与 openid）与
`pnpm seed:dish-images`（回填 10 道菜的图片路径，指向小程序 `static/dish/`）。
两者都幂等，可反复执行。

## 演示与冒烟

```
# 模拟一次支付成功通知（非生产环境）
curl -X POST http://localhost:8000/api/v1/notify/mock \
  -H 'Content-Type: application/json' -d '{"paymentNo":"P...","success":true}'
```
`MOCK_PAY_ENABLED` 仅在 `APP_ENV=development` 下生效，生产环境自动关闭。

```
# 平台支付流水冒烟（68 项断言）
pnpm smoke:platform-payment
# 分账冒烟（50 项断言：生成、金额、幂等、筛选、概况、解冻集合）
node scripts/smoke-profit-share.cjs
# 交易对账冒烟（61 项断言：台账生成、可控差异、明细、幂等、筛选、概况）
pnpm smoke:reconcile
# 商户抽佣冒烟（43 项断言：详情下发、写入边界、审计、权限、快照语义）
pnpm smoke:commission
# 顾客端冒烟（83 项断言：扫码定店、租户隔离、券文案、令牌边界、AppSecret 永不回显）
# 只覆盖不需要顾客登录态的部分；下单/核券/成长值要先在平台后台填好小程序凭据
pnpm smoke:client
# 演示数据（跑完不清理，给平台端页面造内容）
pnpm seed:payment-demo
# 小程序演示数据：券模板 + 会员券三态 + 会员成长值与 openid（幂等）
pnpm seed:client-demo
# 回填菜品图片路径，指向 UI-uniapp/static/dish/ 下的本地图
pnpm seed:dish-images
```

小程序编译验证（先启动 HBuilderX，再执行；`--compile true` 的空格写法不能写成 `--compile=true`）：

```bash
"<HBuilderX>/cli.exe" open
"<HBuilderX>/cli.exe" launch mp-weixin --project "<仓库>/UI-uniapp" --compile true
```

审计只记录平台侧写操作与登录事件（`platform_audit` 表），
`AuditService.record` 失败仅告警、不影响业务事务；只读接口不产生审计。

## 项目结构

```
src/
  config/            # .env 校验与配置装配（APP_ENV=production 时启用 PROD_* 覆盖）
  common/
    constants/       # 状态字典、权限点、缓存 key
    decorators/      # @Public @Roles @Permissions @CurrentUser @MerchantId
    dto/             # PageQueryDto / PageResult
    exceptions/      # BusinessException
    filters/         # 全局异常过滤器
    guards/          # JwtAuthGuard（全局）+ PermissionGuard（全局）
    interceptors/    # 响应包装 + 访问日志
    middleware/      # Host 头校验
    models/          # 响应体与登录态类型
    repository/      # TenantRepo：租户仓储封装
    utils/           # 密码散列、单号、日期
  database/
    data-source.ts   # TypeORM CLI 与运行时共用的数据源
    entities/        # 实体（属性 camelCase，字段 snake_case）
    migrations/      # SchemaBuilder API 编写，无 SQL 文本
    seeds/           # 演示数据
  modules/
    auth/            # 双端登录、令牌会话、本人改密；loadProfile 显式拒绝顾客令牌
    merchant/        # 商家端：store / category / dish / order / member / staff / dashboard
    client/          # 顾客端（小程序）：门店 / 菜单 / 登录 / 会员 / 券 / 下单 / 自助支付
                     #   + config/ 平台侧小程序凭据、guards/ 定店与顾客态两道守卫
    member-growth/   # 会员成长域：growth_value 的唯一写入口，商家端与顾客端都调它
    platform/        # 平台端：商户开通与审核、平台账号、跨租户看板、只读穿透
    audit/           # 平台操作审计（platform_audit）
    health/ redis/
```

同仓库前端项目：`admin-web`（平台端，5173）、`MH-web`（商家端，5174）、
`UI-uniapp`（顾客端微信小程序，uni-app x + HBuilderX）。
两个 Web 端均以相对路径 `/api/v1` 调本服务，dev 由各自 vite proxy 转发；
小程序没有 proxy，直接写死 `UI-uniapp/common/request.uts` 里的 `API_BASE_URL`（上线改正式 https 域名）。

## 约定

- **禁止 SQL**：所有读写走 TypeORM Repository / find 选项，迁移文件用 `new Table()` + `createTable`。
- **统一响应体**：`{ code, message, data, timestamp, requestId }`，成功 `code = 0`；
  失败沿用 HTTP 语义码（401 令牌失效、403 权限不足、409 唯一冲突、429 登录限流）。
- **租户隔离**：`merchantId` 只从 JWT 取（`@MerchantId()`），再经 `TenantRepo` 强制并入查询条件，
  业务代码无法写出漏掉租户条件的查询。
- **鉴权**：全局 `JwtAuthGuard` + `PermissionGuard`；公开接口标 `@Public()`，
  其余用 `@Permissions(Permission.Xxx)` 声明所需权限点。角色权限表见
  `src/common/constants/permission.ts`。
- **令牌**：access token 有效期取 `ACCESS_TOKEN_EXPIRE_MINUTES`；refresh token 存 Redis，
  登出或改密即作废整个会话；连续登录失败 5 次锁定 10 分钟。
- **缓存**：门店信息与看板聚合走 Redis（`CacheKey` / `CacheTtl`），写操作后主动失效。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm build` / `pnpm start:dev` / `pnpm start:prod` | 编译、开发、生产启动 |
| `pnpm migration:generate src/database/migrations/Xxx` | 生成迁移（输出为 SQL 文本，需手工改写成 SchemaBuilder 写法再提交） |
| `pnpm migration:run` / `pnpm migration:revert` | 执行 / 回滚迁移 |
| `pnpm db:seed` | 写入演示数据 |
