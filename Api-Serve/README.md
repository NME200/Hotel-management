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

| 端    | 接口                                 | 账号                                                                                  |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| 平台端  | `POST /api/v1/auth/platform/login` | `admin` / `Admin@123456`                                                            |
| 平台运营 | 同上                                 | `operator` / `Operator@123456`（无开通商户与账号管理权限）                                        |
| 商家端  | `POST /api/v1/auth/merchant/login` | 商户号 `M10001` + `boss` / `Boss@123456`                                               |
| 收银台  | `POST /api/v1/auth/cashier/login`  | 商户号 `M10001` + `cashier` / `Cashier@123`（`manager` 亦可，`kitchen`/`waiter` 会被 403 挡下） |
| 隔离验证 | 同商家端                               | 商户号 `M10002` + `boss` / `Boss@123456`                                               |

`M10001` 为川味小馆（5 分类 / 10 菜品 / 4 会员 / 26 订单 / 演示桌位 `A01`），`M10002` 为江南面馆，  
两库数据互不可见，可用来验证租户隔离。  
`M10001` 下五个角色各留一个账号：`boss` / `manager` / `cashier` / `kitchen` / `waiter`  
（后两个密码同为 `Kitchen@123` / `Waiter@123`），用来验证权限分层。

## 平台端接口

| 分组   | 接口                                                                                                           | 权限点                                               |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 看板   | `GET /platform/dashboard/overview`                                                                           | `platform:dashboard:read`                         |
| 商户   | `GET/POST /platform/merchants`、`GET/PATCH /platform/merchants/:id`、`PATCH /:id/status`                       | `merchant:read/create/update/audit`               |
| 到期预警 | `GET /platform/merchants/expiring?days=30`                                                                   | `merchant:read`                                   |
| 只读穿透 | `GET /platform/merchants/:id/{statistics,dishes,orders,members,staffs}`                                      | `platform:merchant:view`                          |
| 会员管理 | `GET /platform/members`、`/members/profiles`、`/members/:id`、`PATCH /members/:id`、`PATCH /members/profile/:id` | `platform:member:read` / `platform:member:manage` |
| 平台账号 | `GET/POST /platform/accounts`、`PATCH /:id`                                                                   | `platform:account:manage`                         |
| 操作审计 | `GET /platform/audits`、`GET /platform/audits/actions`                                                        | `platform:audit:read`                             |

只读穿透里，菜品/订单/员工直接复用商家端 service（只把租户键从登录态换成路径参数 + 商户存在性校验），  
两端字段结构因此不会漂移；平台端对商户经营数据一律只读，写操作仍只能在商家端发生。

**会员是唯一的例外**：顾客账号本来就跨门店，商家端已经没有会员模块了（`/merchant/members` 已下线），  
会员管理只在平台端发生。停用分两层——`PATCH /members/:id` 停的是微信账号（全平台不能下单），  
`PATCH /members/profile/:id` 停的是某一家店的会员档案（只挡那一家，换一家照旧）。

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

| 表                          | 作用                                               |
| -------------------------- | ------------------------------------------------ |
| `payment`                  | 支付单，`payment_no` 即发给渠道的 `out_trade_no`（全局唯一，幂等键） |
| `payment_refund`           | 退款单，支持部分退款，累计不超原额                                |
| `payment_notify_log`       | 渠道通知原始记录，`(channel, notify_id)` 唯一索引天然去重         |
| `payment_channel_config`   | 渠道级配置：总开关与渠道凭据，覆盖 `.env` 默认值                     |
| `merchant_payment_config`  | 商户进件配置：`sub_mchid`、结算账户、费率抽佣与进件状态                |
| `profit_share`             | 分账单：一笔成功支付拆成「平台抽佣」+「商户结算」两条接收方记录，独立状态机           |
| `payment_reconcile`        | 对账台账：一行 = 商户 × 渠道 × 自然日，渠道账与本地账的汇总核对结果           |
| `payment_reconcile_detail` | 对账差异明细：一笔对不上的业务单，含差异类型、双端金额与处理说明                 |

`order_info.pay_status` 与出餐状态机 `status` **刻意分开**：钱和出餐进度是两条独立状态机，  
混在一起迟早对不上账。支付成功只改 `pay_status`，不推进出餐状态。

**接口**

| 接口                                                                                              | 权限点                     |
| ----------------------------------------------------------------------------------------------- | ----------------------- |
| `POST /merchant/payments` 为订单发起收款（返回客户端调起参数）                                                    | `payment:create`        |
| `GET /merchant/payments` 支付流水分页                                                                 | `payment:read`          |
| `GET /merchant/payments/:paymentNo` 查单（未支付时顺带向渠道查一次）                                            | `payment:read`          |
| `GET /merchant/payments/order/:orderId`、`.../refunds`                                           | `payment:read`          |
| `POST /merchant/payments/order/:orderId/refund` 退款                                              | `payment:refund`        |
| `POST /notify/{wechat\|alipay\|mock}` 渠道异步通知                                                    | 公开，靠验签保护                |
| `GET /platform/payments`、`/summary`、`/refunds`、`/:paymentNo`、`/:paymentNo/notifies` 全平台支付流水（只读） | `platform:payment:read` |
| `GET /platform/profit-shares`、`/summary`、`/:shareNo` 全平台分账（只读）                                  | `platform:payment:read` |
| `GET /platform/reconciliations`、`/summary`、`/:reconcileNo` 交易对账（只读）                             | `platform:payment:read` |
| `POST /platform/reconciliations/run` 手动补跑对账（重算核对结果，不改资金数据）                                      | `platform:payment:read` |

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

| 接口                                                                                | 权限点                               |
| --------------------------------------------------------------------------------- | --------------------------------- |
| `GET/PUT /platform/payment-channels[/:channel]` 渠道开关与凭据                           | `platform:payment:manage`         |
| `POST /platform/payment-channels/:channel/test` 连通性自检                             | `platform:payment:manage`         |
| `GET /platform/merchant-payment-configs`、`.../summary`、`.../merchant/:merchantId` | `platform:merchant-payment:read`  |
| `POST /platform/merchant-payment-configs/:id/audit` 通过/驳回（驳回意见必填，商户端可见）           | `platform:merchant-payment:audit` |
| `PATCH /platform/merchant-payment-configs/:id/status` 启停                          | `platform:merchant-payment:audit` |
| `GET /merchant/payment-configs[/:channel]` 收款状态                                   | `payment:read`                    |
| `POST /merchant/payment-configs/apply` 提交/修改进件资料                                  | `payment:apply`                   |

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

## 小票打印

订单出票是商家侧的事，与顾客端无关，因此全部落在 `/merchant` 下。

| 接口                                                                                          | 权限点                               |
| ------------------------------------------------------------------------------------------- | --------------------------------- |
| `GET/POST /merchant/printers`、`PATCH .../:id`、`PATCH .../:id/status`、`DELETE .../:id` 打印机配置 | 读 `print:read`，写 `printer:manage` |
| `GET /merchant/orders/:id/receipt?ticketType=` 小票数据                                         | `print:read`                      |
| `POST /merchant/print/tasks` 建打印任务                                                          | `print:create`                    |
| `GET /merchant/print/tasks`、`/print/tasks/order/:orderId` 打印流水                              | `print:read`                      |
| `PATCH /merchant/print/tasks/:id/report` 回执打印结果                                             | `print:create`                    |
| `PATCH /merchant/print/tasks/:id/retry` 失败重试                                                | `print:create`                    |

**表**

| 表            | 作用                                                     |
| ------------ | ------------------------------------------------------ |
| `printer`    | 打印机配置：一台一个票种，`browser`（本机小票机）或 `cloud`（云打印机，需厂商 + 设备号） |
| `print_task` | 打印任务流水：一行 = 打一次，含票种、份数、状态、重试次数、失败原因、操作人快照              |

`store` 另加三个字段：`auto_print`（是否自动打印）、`auto_print_on`（`accepted` / `ready`）、`customer_copies`。

**几条硬约束**

- **小票数据远端算好**：`ReceiptData` 由 `PrintService.buildReceipt` 组装，金额全部是「分」的整数，    
  前端只渲染版面。`ticketType=kitchen` 时后端把金额置 0 并令 `showAmount=false`——    
  「后厨票不出现钱」这个判断在后端做，不依赖前端自觉。
- **权限与订单流转分开**：打印是 `print:create`，不是 `order:update`。收银员、后厨、服务员都能打票    
  （`print:read` + `print:create`），但只有店长及以上能改订单状态；改打印机（`printer:manage`）只有 owner/manager。
- **出纸异步**：无论哪种模式，建任务都先落 `pending`，出纸结果由回执收口（浏览器由前端 `report`，    
  云打印机由网关回调）。`browser` 模式在打印对话框被取消时前端也按失败回执，避免出现假成功记录。
- **重试是累加不是新增**：`retryTask` 在原任务上加 `retryCount`，上限 `PRINT_MAX_RETRY = 3`，    
  否则对着一台坏打印机可以无限重试，「这一单打了几次」也就数不清了。
- **自动打印不阻塞订单**：`OrderService.updateStatus` 在事务提交后调 `PrintService.autoPrintForOrder`，    
  异常只记 warn 日志。打印机没插电不能让订单卡在「已接单」。
- 单次份数上限 `PRINT_MAX_COPIES = 5`，门店与打印机两处都校验。

**云打印机（已接真接口）**

`printer.mode=cloud` 时，`PrintService.createTask` 会**同步把票推给厂商网关**并按结果收口任务状态：  
受理成功（飞鹅 `ret=0` / 易联云 `code=0`）置 `success` + `printedAt`，被拒或不可达置 `failed` + 可照做的 `failReason`。  
推单失败**不抛异常** —— 任务已落库，商家可在打印流水里一键重试（重试即重推，`origin_id` 用本地任务 ID 保证网关幂等）。

厂商密钥**只归平台**，商家端永远没有密钥录入项。平台端在「系统设置 → 云打印机配置」统一配置，加密入库（AES-256-GCM）、  
接口只回掩码 + 指纹，配置生效优先级**数据库 > `.env`**。所以商户买了打印机后只需在商家端填机身 sn 即可出纸。


| 接口                                                             | 权限点                     |
| -------------------------------------------------------------- | ----------------------- |
| `GET /platform/print-providers` 厂商配置列表（密钥只回掩码）                 | `platform:print:manage` |
| `PUT /platform/print-providers/:provider` 保存配置（传回掩码=不修改）       | `platform:print:manage` |
| `POST /platform/print-providers/:provider/test` 自检（真去网关换一次访问权） | `platform:print:manage` |

| 表                       | 作用                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `print_provider_config` | 厂商凭据：`provider` 唯一，`enabled` 总开关，`uid`/`clientId` 账号，`api_key_encrypted`/`client_secret_encrypted` 密文，`base_url` 可指向测试网关 |

已实现两家厂商（`modules/print-provider/providers/`）：

- **飞鹅**（`api.de.feieyun.com/Api/Open/`）：表单 POST，公共参数 `user` / `stime` / `sig` / `apiname`，    
  签名是 **`sha1(user + UKEY + stime)`**（`stime` 参与签名，所以只能取一次、签完再发）；    
  接口名靠 `apiname=Open_printMsg` 传而不是拼进路径；**必须判 `ret=0`**（业务失败也回 HTTP 200）。    
  注意 `user` 是**飞鹅云后台的登录用户名（一般是注册邮箱）**，不是 UUID 也不是数字 ID；    
  UKEY 在 `developer.de.feieyun.com` 的「个人中心」；打印机要先绑定到该账号下，否则凭据全对也回「设备不存在」。
- **易联云**（`open-api.10ss.net`）：OAuth2 client_credentials 换 `access_token`（带缓存与安全窗），`/print/index` 出纸、`/printer/state` 查状态；**必须判 `code=0`**。

新增厂商只需写一个 `CloudPrintProvider` 并在 `CloudPrintProviderRegistry` 注册，`PrintService` 与前端都不用改。

## 桌位与扫码点餐

「扫桌贴二维码直接下单」这条链路。桌位是**商家侧的资源**（`store_table`，一桌一行），  
但它的消费方是顾客端，所以解析接口挂在 `client` 域。

### 数据模型与两条硬规则

`store_table` 字段：`table_no`（桌号）、`qr_token`（扫码凭据，全局唯一）、`qr_code_url`、  
`area` / `seats` / `sort` / `status`，唯一索引 `(merchant_id, table_no)`；  
另有 `dining_status`（`idle` / `dining`）、`guest_count`、`opened_at` 三个字段管「这张桌此刻有没有人在吃」。

1. **二维码里放的是 `qr_token`，不是桌号明文。** 改桌号不会作废已贴在桌上的码；     
   某张桌的码外泄可以单独重制；顾客也无法自己拼一个 scene 把订单下到别桌。
2. **制码失败不阻塞建桌。** 微信凭据没配、小程序没发布都会让制码失败，     
   这时桌位照样建出来（`qr_code_url` 为空），商家稍后点「重制码」补即可；     
   只有「重制码」这个显式动作才把失败抛给前端看。

`scene` 约定扩展为 `m=<商户编号>&t=<qr_token>`：`m` 定店、`t` 定桌。  
`qr_token` 是 16 位 base64url 随机串，只含 `A-Za-z0-9-_`，正好落在微信 scene 允许的字符集内。

**`dining_status` 与 `status` 是两条正交的状态**，不要合并成一个字段：  
一张桌可以「正在用餐」同时「被临时停用」（包场、桌子坏了先别再开台），  
也能「空闲」且「启用」。`status` 决定扫码能不能进来，`dining_status` 只是收银台的翻台看板。

### 商家端接口（`TableModule`）

| 方法     | 路径                            | 权限              | 说明                                     |
| ------ | ----------------------------- | --------------- | -------------------------------------- |
| GET    | `/merchant/tables`            | `table:read`    | 桌位列表（含二维码地址）                           |
| POST   | `/merchant/tables`            | `table:manage`  | 新增桌位，并尝试制码                             |
| POST   | `/merchant/tables/batch`      | `table:manage`  | 批量建桌（前缀 + 序号，重名跳过）                     |
| PATCH  | `/merchant/tables/:id`        | `table:manage`  | 改桌号/区域/座位/排序/状态（**不换 token**）          |
| PATCH  | `/merchant/tables/:id/status` | `table:manage`  | 启用 / 停用                                |
| POST   | `/merchant/tables/:id/qrcode` | `table:manage`  | 重制码（换 token，旧码立即失效）                    |
| DELETE | `/merchant/tables/:id`        | `table:manage`  | 删除（该桌二维码同时失效）                          |
| POST   | `/merchant/tables/:id/open`   | `table:operate` | 开台：置为用餐中，登记人数与开台时间                     |
| POST   | `/merchant/tables/:id/close`  | `table:operate` | 清台：置回空闲；桌上有未结账订单时默认拒绝，`force=true` 才强制 |

权限与打印同构：`table:read` 前台/后厨/服务员都有（要看得见桌位），  
`table:manage` 只有 owner / manager（增删改与重制码会改变顾客实际下单行为）。  
`table:operate`（开台清台）给 owner / manager / cashier / waiter —— 翻台是前台的日常动作，  
不该和「改桌位」绑在一起；后厨没有这一项。  
重制码单独记审计动作 `table.qr_regenerate`，token 在审计里只留前后各 4 位；  
开台与清台各记 `table.open` / `table.close`。

**开台不建订单**：客人可能先坐下再点菜，一桌也可以先后下多单（加菜），  
所以 `store_table` 不持有订单 ID，两边靠 `table_no` 关联。  
收银台堂食下单时如果桌位还是空闲会**自动补开台**，避免看板出现「有订单但桌位空闲」的假象；  
清台的未结账检查默认拦，`force` 是给顾客跑单这类真实情况留的口子，不做成软提示。

### 顾客端接口与下单

| 方法   | 路径                              | 说明                                |
| ---- | ------------------------------- | --------------------------------- |
| GET  | `/client/tables/resolve?token=` | 公开接口，token → 门店 + 桌号（校验桌位启用、商户可用） |
| POST | `/client/orders`                | 请求体带 `tableToken`（**不是桌号**）       |

- **堂食必须扫桌位码**：`dineType = dine_in` 时 `tableToken` 必填，后端反查桌号后写入    
  `order_info.table_no`；前端传的任何桌号文本都进不来（DTO 里已没有 `tableNo` 字段）。
- 非堂食忽略 token：顾客从堂食切到自取/外送时本地可能还留着上一个桌位。
- token 不存在与「不属于本店」返回同一句提示，避免用 token 探测别家店有没有这张桌。

### 小程序码生成

`WechatMiniService.getUnlimitedQrCode()` 调 `wxa/getwxacodeunlimit`：

- **access_token 走 Redis 缓存**（`mini:access_token`），TTL 取微信返回的 `expires_in` 减 5 分钟安全垫。    
  该接口有频次限制，且再取一次会让旧令牌失效，必须复用。
- 成功直接返回图片二进制，失败返回 JSON —— 代码按 `content-type` 区分，不做字符串嗅探。
- `check_path` 与 `env_version` 联动：正式版才校验 page 存在；体验版/开发版本来就没发布，    
  开着只会拿到 41030。**小程序未发布时把 `MINI_ENV_VERSION` 设为 `trial`** 即可正常制码。
- 生成的 PNG 经 `UploadService.saveGeneratedImage()` 落进同一套存储（`UPLOAD_DRIVER` 决定本地磁盘还是对象存储），    
  单独放 `qrcode/` 目录便于按目录清理。
- 批量建桌时**串行制码**，单张失败只 warn，不因为第 3 张失败就丢掉后 27 张。

## 收银台与线下收款（`CashierModule`）

门店收银员用的那条链路，前端是独立项目 `CM-web`（dev 5175）。后端不重写任何业务：  
算价调 `ClientOrderPriceService`、收款调 `POST /merchant/payments`、出餐流转与打票都复用商家端那套。

### 登录闸门：`POST /auth/cashier/login`

与商家端同一套账号密码，只多一道权限检查：

- **先验密码、再判 `cashier:use`**。顺序反了就会从 403 与 401 的差别里泄露「这个账号存不存在」。
- **密码对但没权限时不累加登录失败计数**：那是角色问题不是密码问题，    
  算进失败次数会让收银员试几次就被锁 10 分钟。
- 后厨与服务员拿不到 `cashier:use`，登不进收银台；服务员仍可开台清台（在商家端「桌位管理」）。

### 接口

| 方法   | 路径                                        | 权限              | 说明                                         |
| ---- | ----------------------------------------- | --------------- | ------------------------------------------ |
| GET  | `/merchant/cashier/payment-methods`       | `cashier:use`   | 本店能用的收款方式；不可用的在线渠道带一句能照做的原因                |
| GET  | `/merchant/cashier/members/lookup?phone=` | `member:lookup` | 按手机号认会员，只回脱敏号码；查不到返回 `null`，别店顾客带「按原价结算」提示 |
| POST | `/merchant/cashier/orders/preview`        | `order:create`  | 下单前算价，不落库不扣库存                              |
| POST | `/merchant/cashier/orders`                | `order:create`  | 线下点餐建单，堂食自动开台，初始 `status=accepted`         |

权限刻意分三层而不是一把钥匙：`cashier:use` 决定能不能进收银台，  
`order:create` 决定能不能替顾客开单，`member:lookup` 决定能不能查会员。  
「只让收银员看收款方式但不许开单」这类诉求不用改代码。

认会员**刻意不自动建档**：一次查询顺手写库会让「查一下」变成有副作用的动作，  
而是否把散客发展成会员是经营决策，不是收银动作。

与顾客自助下单的四点差异：可以是散客（不享会员价）、桌号来自选桌位 ID 而非扫码、  
不支持优惠券（线下核销走人工）、开单即等于商家接单。支付状态仍是独立的 `unpaid`，  
收款成功才由支付域置 `paid` 并发取餐码；出餐状态不被支付推进，与全项目口径一致。

### 现金与收款码是「线下渠道」，不是特殊分支

`cash` / `offline` 在支付域里是一等渠道（`providers/offline.provider.ts`），  
走的是与微信/支付宝完全相同的 `POST /merchant/payments` → `markOrderPaid` 链路，  
所以收款记录与在线支付共用同一张 `payment` 表、同一套状态机，不会出现「两处都在改订单支付状态」。

三点不同都收在 `payment/constants/payment.constant.ts` 的 `OFFLINE_CHANNELS` 里，  
不要在业务代码里散写 `channel === 'cash'`：

1. 不需要平台开渠道开关、不需要商户进件，因此**不出现在**渠道配置列表里；
2. 没有渠道账单，**不参与对账**（不在 `RECONCILE_ENABLED_CHANNELS`）；
3. 钱没走渠道，平台无从在资金流里冻结抽佣，所以 `needProfitSharing=false`，     
   **不生成分账单**（不是「生成一张 0 元的分账单」）。

**在线渠道（微信/支付宝）在收银台不可代收**：那要走付款码被扫，需要单独的产品权限与真实渠道实现，  
当前只接了 `mock`。收银台上这些渠道会显示但不可用，并说明原因（未进件 / 审核中 / 被平台停用）。

## 顾客端（微信小程序）接口

小程序是**一个 appid 服务全部商户**的 SaaS 形态，所以每个请求都要先「定店」：  
扫码进来的 `scene`（门店码 `m=M10001`、桌位码 `m=M10001&t=<qr_token>`）决定门店与桌位，  
没有 scene 就落到门店列表由顾客自己选。定店与租户校验集中在 `ClientMerchantGuard`，  
业务代码不再重复判断。桌位码的解析见上一节「桌位与扫码点餐」。

| 分组  | 接口                                                                                                                                                               | 登录要求                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 门店  | `GET /client/stores`、`GET /client/context?merchantCode=`                                                                                                         | 公开                                            |
| 菜单  | `GET /client/menu`、`/client/dishes/recommend`、`/client/dishes/search`、`/client/dishes/:id`                                                                       | 公开                                            |
| 登录  | `POST /client/auth/login`（可带 `phoneCode` 一键绑号）、`/client/auth/sms/code`、`/client/auth/sms/login`、`/client/auth/phone`、`/refresh`、`/logout`、`GET /client/auth/me`  | 前三条公开，`/phone` 需顾客令牌                          |
| 会员  | `GET /client/member`、`/member/center`、`PATCH /member/profile`                                                                                                    | 顾客令牌                                          |
| 优惠券 | `GET /client/coupons/claimable`（公开）、`/coupons/mine`、`/coupons/counts`、`POST /coupons/claim`、`/coupons/redeem`                                                    | 除领券中心外需顾客令牌                                   |
| 订单  | `POST /client/orders/checkout`、`POST /client/orders`、`GET /client/orders`（`scope=all` 为全部门店）、`GET /client/orders/:orderNo`、`POST /client/orders/:orderNo/cancel` | 顾客令牌                                          |
| 支付  | `GET /client/payments/channels`、`POST /client/payments`、`GET /client/payments/:paymentNo`、`/payments/order/:orderNo`                                             | 顾客令牌                                          |
| 平台  | `GET/PUT /platform/mini-program-config`、`POST .../test`                                                                                                          | `platform:mini-program:manage`（仅 admin）       |
| 平台  | `GET/PUT /platform/sms-config`、`POST /platform/sms-config/test`                                                                                                  | 读 `platform:sms:read`，写 `platform:sms:manage` |

**令牌与权限**：顾客令牌与后台令牌同一套签发、Redis 会话与刷新机制，只是  
`userType = client`、角色 `member`、权限集合恒为空。因此后台接口靠 `@Permissions`  
天然挡住顾客令牌，反过来 `/client` 受保护接口用 `ClientSessionGuard` 挡住后台令牌  
（报「该接口仅顾客登录态可访问」），两端的 ID 不会互相冒用。

**顾客令牌不带门店**：载荷里的 `sub` 是 `customer.id`（微信账号），`merchantId` 恒为 null，  
门店由每次请求的 `merchantCode` 决定。守卫把两者一起解析成「这个顾客在这家店的会员档案」，  
所以顾客在多家店之间切换不需要重新登录，一个账号也能在多家店分别下单。  
把身份和档案拆成两张表正是为了这件事：`customer` 回答「你是谁」（openid 全局唯一、昵称、手机号），  
`member` 回答「你在这家店是什么等级、还剩多少储值、领了哪些券」——  
余额与券按店独立，因为那是这家商户欠顾客的真实负债，A 店充的钱不该在 B 店花。  
`AuthService.loadProfile` 也显式拒绝 client 类型，避免顾客 ID 被当成员工 ID 查。

**顾客登录有两种方式，共用同一套身份落位**（登录页 `pages/login/login`）：

| 方式                   | 接口                                                           | 号码从哪来                                                                   |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 手机号 + 短信验证码（未注册自动建档） | `POST /client/auth/sms/code` → `POST /client/auth/sms/login` | 顾客自己输入，验证码证明持有                                                          |
| 微信手机号一键登录            | `POST /client/auth/login` 带 `phoneCode`                      | 顾客点「手机号快速验证组件」，前端只交一次性 `code`，后端用 `wxa/business/getuserphonenumber` 换真号 |

两条路都**不接受前端直接传手机号**（验证码那条传的是号码本身，但要靠短信证明持有），  
换到的号码写进 `customer.phone`。

- **绑号失败不挡登录**（一键那条）：换号失败时登录照样成功，原因放在返回的 `phoneNote` 里由小程序 toast。    
  `code` 是一次性的，失败不能拿同一个码重试。
- **验证码登录总是静默带一次 `wx.login`**（`wxCode`）：这样这条身份既有手机号又有 openid。    
  换不到 openid 时整笔失败而不是降级成「只有手机号」—— 那会留下一条日后必须合并的重复身份。
- **身份落位按「手机号优先」**：商家导入的历史会员有手机号但没有 openid，    
  先按 openid 建号会留下两份档案（一份有微信没资产、一份有资产没微信）。    
  所以先按号码找档案：号码那条**没有微信身份**就直接把 openid 挂上去（顾客立刻看到原有等级/余额/券）；    
  当前微信身份已经攒了档案时，只有在「两边没有同一家店的档案」前提下才搬 `member` 并删掉空壳身份；    
  同店两份档案**一律不自动合并**（那等于把两份等级余额相加，是经营决策），回一句提示让顾客找门店。
- 号码已被**别的微信号**占着时不接管、不覆盖，只提示联系门店 —— 手机号会被运营商回收复用。    
  纯手机号验证码登录（没有新 openid）时不受这条限制：那时号码本身就是凭据，直接登进那条档案。
- 已绑定的号码不允许自助改（`PATCH /client/profile` 同样拒绝），换号走门店人工。
- 首次补上手机号会走「完善资料送成长值」，两条路共用同一个钩子、不重复发奖。

**短信验证码（`modules/sms/`）**：`SmsProvider` 端口 + 四个驱动，用哪个由生效配置的 `driver` 决定，  
驱动按 `SmsProviderRegistry` 注册表取（新增通道只写 provider 并登记，配置层与发送层都不加 `if`）。

- `aliyun`：阿里云 Dysmsapi，**签名自己实现**（RPC HMAC-SHA1，`POST&%2F&` + 排序编码串），不引 SDK；
- `tencent`：腾讯云短信 API 3.0，**TC3-HMAC-SHA256 也自己实现**（规范请求串 → `日期/sms/tc3_request`    
  两步派生密钥），拼法已用官方文档示例反证：请求体哈希与规范请求串哈希与文档给的值一字不差。    
  号码在这里要补 `+86`（缺国家码会被回 `PhoneNumberInvalid`，看起来像顾客手机号填错）；    
  腾讯云的模板变量是**按位置**的（`{1}`），所以只传一个元素的 `TemplateParamSet`；
- `custom`：自定义短信网关（运营商或第三方小通道）。契约是一份**最小**规范：一律 `POST` JSON、    
  请求体按模板渲染（占位符 `{phone} {code} {signName} {templateCode} {token}`）、鉴权按    
  `头名: 头值模板` 注入一个头、**HTTP 2xx 即视为发送成功**。模板是「解析成对象再替换」而不是    
  字符串直接替换 —— 签名里出现引号时字符串替换会拼出非法 JSON，那是顾客侧的发送失败；    
  地址与模板的形状在**保存时**就校验（缺 `{phone}`/`{code}`、不是 JSON 对象、地址没有协议都当场拒），    
  半成品（还没填）仍然允许保存；
- `log`：只把验证码写进服务日志，**生产环境直接拒绝**（否则等于把登录凭据抄送给日志采集系统），    
  本机与 CI 用它把「发码 → 校验 → 登录」整条跑通；
- **各通道的口径只写一份**（`constants/sms-driver.constant.ts`）：标签、必填项、界面上出现哪些字段、    
  密钥字段、官方地域与网关默认值、字段中文名。云厂商的凭据字段名按厂商原文给（阿里云 `AccessKey ID`    
  / 腾讯云 `SecretId`），否则运营会拿着一个名字去另一家的控制台找不存在的东西。    
  凭据列是**共用**的（`access_key_id` / `access_key_secret_encrypted` 按语义命名，与    
  `print_provider_config` 同一口径），换通道时界面会提示「要重填该通道的密钥」。
- **配置优先读库（`sms_config` 全局一行），`.env` 只当首次部署的兜底值**：录入入口是平台端    
  「系统设置 → 短信配置」，两把密钥（云厂商 Secret、自定义网关密钥）用 AES-256-GCM 密文入库、主密钥仍是 `.env` 的    
  `CONFIG_ENCRYPTION_KEY`，接口只回掩码 + 8 位指纹，回传掩码=不修改、空串=清除 ——    
  与支付渠道、云打印机厂商完全同一套规则。生效配置缓存 60 秒（`CacheKey.smsConfig`），保存时主动删。    
  `.env` 那套值**只服务 `SMS_DRIVER` 选中的那一个通道**：后台换成另一家时，不会把给阿里云准备的    
  SecretId 或 `cn-hangzhou` 当成腾讯云的值继续用。表里没行时按该通道的必填项是否齐备推断开关与    
  「配好了没有」，缺任一项就是「未配置」，顾客端只留微信一键登录那条路。
- **短信签名要按主体审核、一套凭据服务全部商户**，所以商户端与门店端都不该出现短信配置入口，    
  平台端也只有 admin 能写（`platform:sms:manage`，运营只读）。
- **自检尽量不占发送额度**：阿里云走 `QuerySmsSign`（查签名审核状态），腾讯云走    
  `DescribeSmsTemplateList`（查模板在不在这个账号下、审核状态、以及模板里有几个变量位），都是免费查询接口。    
  自定义网关没有这种接口，所以它的自检**只校验配置形状、不打网关**（真打一次就是真发一条），    
  回话里明确说「请用自己的手机号实收一条」。
- 验证码只存 Redis（5 分钟、错满 5 次作废、用一次即删），**不落库**；
- 节流三层：同号 60 秒、同号每日 10 次、单 IP 每日 50 次；发送失败**回滚额度**，    
  否则厂商配置修好后所有人还得等到明天；
- **发码不泄漏注册状态**：新老号码回话一字不差，否则这里就成了「输手机号查是不是本店会员」的枚举接口。


**微信一键授权的门槛与费用**（写在代码注释里也挡不住运营来问）：只对**非个人主体且已完成微信认证**  
的小程序开放，**每次调用成功收 0.03 元**，每账号 1000 次体验额度；额度不足时前端拿到  
`e.detail.errno === 1400001`，未开通时微信回 48001。所以这里只在顾客明确点授权按钮时才调用，  
静默登录流程里一次都不碰。微信开发者工具**不模拟**这个组件，那条链路只能真机验收  
（短信那条在开发者工具里可以整条跑通）。

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
会员券 17 张覆盖未使用/已使用/已过期、4 位顾客的成长值与 openid）与  
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
# 会员身份分层冒烟（39 项：切店不掉登录、档案按店独立、跨店订单列表、
# 平台停用账号 vs 单店停用档案、商家端会员接口已下线、越权读别人的单）
# 顾客令牌取自 .e2e/token.txt，本地签发跑 .e2e/mint-client.cjs
pnpm smoke:member
# 小票打印冒烟（68 项断言：金额分项自洽且为整数分、后厨票不含金额、
# 流水 pending→success、重试累加不新增、重试封顶、打印机与门店份数校验、
# 云推送两条链路——平台未配厂商时给出「找平台运营」的明白话、
# 平台配好后只填 sn 即真出纸并校验签名/设备号/幂等键、网关不可达收口为 failed 且可重推）
pnpm smoke:print
# 收银台链路冒烟（80 项断言：登录闸门先验密码再判权限、403 不计入锁定、算价与建单金额一致、
# 堂食必选桌位且自动开台、未收款不发取餐码、现金收款即成功且不生成分账单、
# 收款码退款、清台的未结账守卫与强制清台、table:operate 与 cashier:use 解耦、
# 今日待收款口径、开台/清台/线下点餐的审计留痕）
pnpm smoke:cashier
# 手机号验证码登录冒烟（82 项：发码不泄漏注册状态、验证码 5 分钟/错 5 次作废/用一次即删、
# 同号与单 IP 节流、未注册自动建档、认领商家导入的历史会员且不长出第二条同手机号身份、输入校验；
# 第 8 段验平台端配置：运营可读不可写、密钥密文入库只回掩码+指纹、回传掩码不覆盖、空串才清除、
# 未就绪时发码给可执行提示而不是 500；第 9 段验通道口径（同一列密钥在两家分别叫
# AccessKey Secret / SecretKey、必填项跟着通道走）；第 10 段把自定义通道打到本机 18099 的临时网关桩上，
# 真跑一遍「模板渲染 → 鉴权头替换 → 顾客收码 → 登录成功」，并验网关 5xx 时额度回滚与坏模板被拒；
# 跑完按快照原样写回 sms_config）
pnpm smoke:sms
# 演示数据（跑完不清理，给平台端页面造内容）
pnpm seed:payment-demo
# 小程序演示数据：券模板 + 会员券三态 + 顾客 openid 与本店会员成长值（幂等）
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
    merchant/        # 商家端：store / category / dish / order / staff / dashboard（会员已移出商家端）
                     #   + print/ 小票打印（打印机配置、小票数据、打印任务流水与重试）
                     #   + table/ 桌位管理（一桌一码：建桌、改桌、制码/重制码、开台清台）
                     #   + cashier/ 收银台（线下点餐建单、按手机号认会员、收款方式清单）
                     #   + upload/ 图片上传与对象存储（菜品图与桌位二维码共用）
    client/          # 顾客端（小程序）：门店 / 菜单 / 登录 / 会员 / 券 / 下单 / 自助支付
                     #   + config/ 平台侧小程序凭据、wechat/ 登录与小程序码、guards/ 定店与顾客态两道守卫
    member-growth/   # 会员成长域：growth_value 的唯一写入口，商家端与顾客端都调它
    sms/             # 短信验证码：SmsProvider 端口 + log/aliyun/tencent/custom 四驱动 + 注册表、发码节流与校验
                     #   + sms-config.service 生效配置（库优先、.env 兜底、密钥密文）、platform-sms-config.controller 平台录入与自检
    platform/        # 平台端：商户开通与审核、平台账号、会员管理、跨租户看板、只读穿透
    audit/           # 平台操作审计（platform_audit）
    health/ redis/
```

同仓库前端项目：`admin-web`（平台端，5173）、`MH-web`（商家端，5174）、  
`CM-web`（收银台，5175）、`UI-uniapp`（顾客端微信小程序，uni-app x + HBuilderX）。  
三个 Web 端均以相对路径 `/api/v1` 调本服务，dev 由各自 vite proxy 转发；  
小程序没有 proxy，直接写死 `UI-uniapp/common/request.uts` 里的 `API_BASE_URL`（上线改正式 https 域名）。

## 约定

- **禁止 SQL**：所有读写走 TypeORM Repository / find 选项，迁移文件用 `new Table()` + `createTable`。
- **统一响应体**：`{ code, message, data, timestamp, requestId }`，成功 `code = 0`；    
  失败沿用 HTTP 语义码（401 令牌失效、403 权限不足、409 唯一冲突、429 登录限流）。
- **列表一律分页**：`PageQueryDto` 的 `pageSize` 上限是 **100**（超了 400，不是静默截断）。    
  前端想「一次看全」必须按页捞，不能把 `pageSize` 写成 300 之类（收银台曾因此整列菜品取不到）。    
  确实要一次返回全部的只有少数不分页接口（`/merchant/tables`、`/merchant/printers`、    
  `/merchant/payment-configs`），它们返回裸数组，前端别再套 `.list`。
- **租户隔离**：`merchantId` 只从 JWT 取（`@MerchantId()`），再经 `TenantRepo` 强制并入查询条件，    
  业务代码无法写出漏掉租户条件的查询。
- **鉴权**：全局 `JwtAuthGuard` + `PermissionGuard`；公开接口标 `@Public()`，    
  其余用 `@Permissions(Permission.Xxx)` 声明所需权限点。角色权限表见    
  `src/common/constants/permission.ts`。
- **令牌**：access token 有效期取 `ACCESS_TOKEN_EXPIRE_MINUTES`；refresh token 存 Redis，    
  登出或改密即作废整个会话；连续登录失败 5 次锁定 10 分钟。
- **缓存**：门店信息与看板聚合走 Redis（`CacheKey` / `CacheTtl`），写操作后主动失效。

## 运行与可观测性

### 健康探针

三个入口语义不同，编排平台要分别配置：

| 路径                         | 语义                         | 用途                           |
| -------------------------- | -------------------------- | ---------------------------- |
| `GET /api/v1/health/live`  | 只表示进程在运行，**不检查任何依赖**       | 存活探针。依赖抖动时不会误判进程已死而反复重启容器    |
| `GET /api/v1/health/ready` | 检查数据库与 Redis，未就绪返回 **503** | 就绪探针。未就绪的副本被摘出负载均衡，但不重启      |
| `GET /api/v1/health`       | 与 ready 同数据，**始终 200**     | 人工/脚本查看，健康度看 body 的 `status` |

三个探针整体跳过限流，避免被编排器的高频调用打成 429 而误判。

### 接口限流

基于 `@nestjs/throttler`，计数落在 **Redis**（多副本共享同一份配额；用进程内存计数在多副本下等于没限流）。  
两个节流器叠加判定：

- `default`：所有接口，默认 600 次/分钟；
- `auth`：仅登录与换令牌（路径匹配 `/auth/*/login`、`/auth/*/refresh`），默认 10 次/分钟。

超限后封禁一整个窗口，并返回统一响应体、HTTP 429。参数由 `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` /  
`THROTTLE_LOGIN_LIMIT` 控制。

**`TRUST_PROXY` 必须与实际部署一致**：部署在 Nginx / 云负载均衡之后时若不配，  
`req.ip` 永远是代理地址，限流会退化成「全站共享一个桶」——一次异常流量就能把正常用户一起拦掉，  
审计日志记录的来源 IP 也全是假的。留空时生产默认按 1 跳处理。

### 日志

生产输出 **JSON 行日志**（`time` / `level` / `service` / `context` / `message`，错误另带 `stack`），  
便于云平台按字段建索引；开发保留 Nest 默认可读格式。访问日志含方法、路径、状态码、耗时、  
来源 IP、操作人与 `requestId`（与响应头 `x-request-id` 同值，可直接串起整条链路）。

日志器在建应用之前就交给 Nest（`NestFactory.create({ logger })`）。早先是先 `bufferLogs` 再  
`useLogger` 切换，结果一旦启动阶段卡住（例如配置指向了不存在的数据库域名），缓冲日志永远等不到  
那次切换，生产上表现为「进程活着、端口不监听、一行日志都没有」，完全没有排查线索。

启动时会打印一行「实际连到了哪里」（环境、数据库 host/port/库名、Redis、图片存储驱动、  
信任代理层数，不含口令），用于一眼确认没有连错环境。

### 图片存储

`UPLOAD_DRIVER` 二选一：

- `local`（默认）：写本地磁盘，URL 为 `/uploads/...` 相对路径。**仅适合单机**——    
  多副本下上传落到 A 副本、图片请求被路由到 B 副本就是 404，容器重建更会直接丢图。
- `s3`：写 S3 兼容对象存储（腾讯云 COS / 阿里云 OSS / MinIO），URL 为绝对地址。    
  多副本部署必须用它，或把共享存储挂到所有副本的 `/app/uploads`。

选 `s3` 时 `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PUBLIC_BASE_URL` 必填，  
缺任何一项**启动阶段就报错**（这类配置漏填若拖到运行期，表现是「上传偶发 500」，极难定位）。

签名是自己实现的 SigV4（`storage/aws-v4-signer.ts`），不引 `@aws-sdk/client-s3`：  
上传只用得到「PUT 一个对象」，为此拖进上百个包、且随版本频繁变动，对生产镜像与安全面都不划算。  
算法正确性由 `pnpm verify:sigv4` 用 AWS 官方测试套件向量校验。

### 生产配置要点

- `PROD_DB_HOST` / `PROD_DB_PASSWORD` / `PROD_REDIS_HOST` 是**可选覆盖项**：填了才生效，    
  留空回退到 `DB_*` / `REDIS_*`。**不要留占位符**——它是「真值」，会让生产去连一个不存在的地址。
- 容器镜像内**不含 `.env`**，配置一律由环境变量注入；镜像以非 root 运行，用 `tini` 作 PID 1 以保证优雅退出。
- 数据库迁移不在启动时执行，作为独立一次性任务（多副本并发跑迁移会互相锁表），详见根目录 `DEPLOY.md`。
- 小程序凭据（`MINI_APP_ID` / `MINI_APP_SECRET`）推荐在平台后台「小程序配置」维护（AppSecret 加密入库）；    
  `.env` 只是首次部署兜底，后台保存过就以数据库为准。
- 短信凭据同一条规则：平台后台「系统设置 → 短信配置」写进 `sms_config`（云厂商 Secret 与自定义网关密钥    
  都是密文入库），通道四选一：`aliyun` / `tencent` / `custom` / `log`，`SMS_*` 只是兜底且只服务    
  `SMS_DRIVER` 选中的那一个通道。**生产环境不要把 `SMS_DRIVER` 设成 `log`**，那等于把登录凭据交给日志采集；    
  代码里已直接判为不可用（保存开启会被拒），彻底不用短信就把总开关关掉，顾客只走微信手机号一键登录。    
  用 `custom` 时注意：本系统对它只约定「POST JSON + 2xx 算成功」，且它的自检不打网关，    
  上线前要用真号实收一条。
- **`MINI_ENV_VERSION` 决定桌位码能不能生成**：小程序未发布时用默认的 `release` 会拿到 41030    
  （page 在正式版里不存在），先设 `trial`（体验版）或 `develop`；发布后改回 `release` 才会校验 page 存在。    
  `MINI_QR_PAGE` 是扫码落地页（默认 `pages/index/index`），必须是 `pages.json` 里真实存在的页面。

## 常用命令

| 命令                                                    | 作用                                          |
| ----------------------------------------------------- | ------------------------------------------- |
| `pnpm build` / `pnpm start:dev` / `pnpm start:prod`   | 编译、开发、生产启动                                  |
| `pnpm migration:generate src/database/migrations/Xxx` | 生成迁移（输出为 SQL 文本，需手工改写成 SchemaBuilder 写法再提交） |
| `pnpm migration:run` / `pnpm migration:revert`        | 执行 / 回滚迁移                                   |
| `pnpm db:seed`                                        | 写入演示数据                                      |
| `pnpm verify:sigv4`                                   | 用 AWS 官方测试套件向量校验对象存储签名算法（需先 `pnpm build`）   |

部署（构建镜像、环境变量、迁移、探针、对象存储、上线检查清单）见仓库根 `DEPLOY.md`。
