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
├── api/          # 每个业务模块一个接口文件（auth / merchant / merchant-insight / member / account / dashboard / audit / payment / mini-program / print-provider / sms）+ types/ 后端契约类型
├── components/   # 跨模块通用组件（状态标签、分页条、时间格式化、图片地址录入）
├── constants/    # 字典（商户状态/门店状态/订单状态/就餐方式/菜品状态/会员等级/员工角色/平台角色/审计动作）、菜单、权限点、接口与存储常量
├── layouts/      # DefaultLayout + 侧边菜单/顶栏/面包屑/改密码对话框
├── router/       # 静态路由表 + meta + 登录与权限守卫
├── stores/       # Pinia：auth（登录态与权限）、app（侧边栏状态）
├── utils/        # auth-storage（VueUse useLocalStorage）、format、validate
└── views/        # login / dashboard / merchant / expiring / member / payment / system / account / audit / error
```


## 页面与权限

| 页面       | 路由                       | 权限点                                                                          |
| -------- | ------------------------ | ---------------------------------------------------------------------------- |
| 平台看板     | `/dashboard`             | `platform:dashboard:read`                                                    |
| 商户管理     | `/merchant`              | `merchant:read` + `merchant:create` / `merchant:update` / `merchant:audit`   |
| 商户数据只读穿透 | 商户详情抽屉内 Tab              | `platform:merchant:view`                                                     |
| 商户抽佣设置   | 商户管理「编辑」弹窗内              | `merchant:update`（运营无此权限，只有超管能改）                                             |
| 到期预警     | `/expiring`              | `merchant:read`                                                              |
| 会员管理     | `/member`                | 查看 `platform:member:read` / 启停与档案编辑 `platform:member:manage`                 |
| 支付渠道     | `/payment/channel`       | `platform:payment:manage`（仅超级管理员）                                            |
| 商户支付     | `/payment/merchant`      | 查看 `platform:merchant-payment:read` / 审核启停 `platform:merchant-payment:audit` |
| 支付流水     | `/payment/flow`          | `platform:payment:read`                                                      |
| 平台分账     | `/payment/profit-share`  | `platform:payment:read`                                                      |
| 交易对账     | `/payment/reconcile`     | `platform:payment:read`                                                      |
| 平台账号     | `/account`               | `platform:account:manage`                                                    |
| 操作审计     | `/audit`                 | `platform:audit:read`                                                        |
| 小程序配置    | `/system/mini-program`   | `platform:mini-program:manage`（仅超级管理员）                                       |
| 云打印机配置   | `/system/print-provider` | 查看 `platform:print:read` / 保存与自检 `platform:print:manage`（仅超级管理员）             |
| 短信配置     | `/system/sms`            | 查看 `platform:sms:read` / 保存与自检 `platform:sms:manage`（仅超级管理员）                 |

`platform_admin` 拥有全部权限；`platform_operator` 只有 `merchant:read`、`merchant:audit`、  
`platform:merchant:view`、`platform:dashboard:read`、`platform:audit:read`、  
`platform:merchant-payment:read`、`platform:merchant-payment:audit`、`platform:payment:read`、  
`platform:member:read`、`platform:member:manage`、`platform:print:read`、`platform:sms:read`，  
进入「平台账号」「支付渠道」「小程序配置」「云打印机配置」会被路由守卫重定向到 403。  
菜单可见性与按钮 disabled 均由后端下发的 `permissions` 驱动；商户详情抽屉里的所有业务数据均为只读，不提供编辑入口。

「平台看板」（`GET /platform/dashboard/overview`）按「先结论 → 再趋势 → 再待办」三档排：  
顶部概览条只放数据截至时间与刷新，右侧两枚待办胶囊（待审核商户 / 到期预警）直接跳到对应页；  
下面一行四张 KPI，环比 chip 吃 `growthRate` 的结果、算不出（上期为 0）时退回副文案而不是显示 `NaN%`；  
主图是 ECharts 的订单柱 + 营业额面积折线（双轴，末点轴标签写「今日」而不是日期），右侧「商户构成」把  
`expiringCount` 单列一行并注明它是「正常营业」的子集 —— 后端这个字段是"30 天内到期 + 已过期未停用"，  
两者状态都还是 Active，混进堆叠条会让总数对不上。趋势图组件与 KPI 卡放在  
`views/dashboard/components/`，ECharts 按需在 `echarts/core` 上注册（Bar/Line + Grid/Legend/Tooltip + Canvas），  
所以主包不变，只有看板这一条懒加载路由多出约 190KB gzip。

「会员管理」（`GET /platform/members`）是会员的唯一管理入口，商家端已不再保留会员模块。页面按身份分层拆成两个标签页：  
「顾客账号」是一个微信身份（跨全部门店），列表给掩码手机号、开通门店数、跨店累计订单，  
「停用/恢复」写的是 `customer.status`，确认文案会点明这会让该顾客在所有门店都下不了单；  
「门店档案」是同一个顾客在各家店的 `member` 记录（等级、成长值、积分、余额、备注），  
「编辑档案」调 `PATCH /platform/members/profile/:id`，只影响这一家店。详情抽屉一次请求同时拿回账号与其档案表，  
完整手机号只在抽屉里出现（列表仍是掩码），档案行可在抽屉内直接启停与改备注。  
等级中文名一律用后端下发的 `levelLabel`（`绿卡/银卡/金卡/钻石会员`），前端的 `MEMBER_LEVEL_DICT` 只作筛选与标签配色。

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

「云打印机配置」（系统设置 → 云打印机配置）管理的不是商家自己的打印机，而是**平台与云打印机厂商之间的账号凭据**——  
飞鹅的 `user`（后台登录名，一般是邮箱）+ `UKEY`、易联云的 `client_id` + `client_secret`。这张页面存在的意义就是让商家端只填一个机身 sn 就能出纸：  
密钥全部收口在这里，加密入库（AES-256-GCM），接口只回掩码 `********` 与指纹，写入口径与「小程序配置」完全一致  
（传回掩码 = 不修改、清空需显式二次确认、覆盖需二次确认）。每家厂商一张卡片，含总开关（`enabled`，关掉即全平台停推）、  
账号、网关地址（`baseUrl`，可指向测试网关）、密钥掩码/指纹、凭据来源（`database` / `env` / `none`）与「立即自检」——  
自检会真的拿凭据去厂商网关换一次访问权（飞鹅探 `Open_queryPrinterStatus`、易联云换 `access_token`）。  
保存与自检只归 `platform:print:manage`（仅超管）：密钥是平台与厂商的合同凭据，运营可以看状态但不该能改。

「短信配置」（系统设置 → 短信配置）管的是顾客登录页「获取验证码」那条链路，全局一份、不分商户：  
通道四选一 —— `阿里云短信`（AccessKey ID / AccessKey Secret / 签名 / 模板 CODE）、`腾讯云短信`  
（SecretId / SecretKey / 短信应用 SdkAppId / 签名 / 模板 ID）、`自定义短信网关`（网关地址 + 请求体 JSON 模板 +  
鉴权头 + 网关密钥，给运营商或第三方小通道用）、`日志通道`。日志通道什么都不用填、只把验证码写进服务日志，  
因此生产环境下这个选项直接 disabled（后端下发 `logAllowed`，标题会写成「生产环境不可用」）。  
**每个通道要填什么、字段叫什么、哪些必填，全部由后端一份通道口径下发**（`drivers[]`），  
页面不自己写第二份：同一列密钥在阿里云那档叫「AccessKey Secret」、在腾讯云那档叫「SecretKey（云 API 密钥）」，  
切通道时表单重排、必填星号与占位符跟着变，不需要先保存一次才能填。  
云厂商两家的凭据共用同一列（按语义命名而不是按厂商命名），所以切了通道页面会提醒「请重新填写该通道的密钥」。  
两把密钥（云厂商 Secret、自定义网关密钥）的口径与「小程序配置」「云打印机配置」一字不差：密文入库、  
只回掩码 `********` + 8 位指纹，留空或保持掩码=不修改（压根不下发这个 key），清空要把框清空后保存，  
且**覆盖与清空都会在按下保存时二次确认**，确认文案讲清后果（顾客改走微信手机号一键登录）。  
`region` / `endpoint` 对云厂商是可选项，占位符显示的是当前生效值；对自定义通道 `endpoint` 就是必填的网关地址。  
顶部一条状态语直接回答运营真正想问的：「配置就绪，顾客可正常收到验证码」/「『腾讯云短信』还缺：xxx」/  
「总开关已关闭：顾客端点『获取验证码』会收到……」，说的是**已保存生效那份**配置，页面草稿切通道不会改写它；  
下方注明凭据来源（`database` 后台保存 / `env` 回落 `.env` / `none` 未配置）。「自检」调  
`POST /platform/sms-config/test`：阿里云走 `QuerySmsSign` 查签名审核状态、腾讯云走 `DescribeSmsTemplateList`  
查模板在不在、审核状态以及模板里有几个变量位，都**不占发送额度、不给某个号码真发短信**；  
自定义网关没有这种免费接口，所以它的自检只校验配置形状（并说明要实收一条），保存会清掉上一次自检结论，  
免得旧配置的错误顶在新配置下面。第二张卡片是「接入步骤」，按当前选中的通道切换内容：  
阿里云讲开通短信服务与申请签名/模板、变量名固定 `code`、用只授 `AliyunDysmsFullAccess` 的 RAM 用户；  
腾讯云讲三样东西（签名、模板 ID、最常被漏的 SdkAppId）与模板变量按位置只留一个变量位；  
自定义通道讲「一律 POST JSON、2xx 即算成功、自检不真发」这份最小契约；  
日志通道讲生产禁用。运营不必再去翻后端注释。

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

## 侧边栏

菜单结构在 `src/constants/menu.ts`，拆成 `MENU_SECTIONS`（经营 / 商户与会员 / 资金 / 系统）与  
`MENU_FOOTER_ITEMS`（平台账号、操作审计）：低频的管理项固定沉到窗口下沿并再压暗一档，  
不跟每天的动线抢注意力；分组只是扫读单位，可见性仍逐项按权限算，整组被清空时连标题一起隐藏。

- **选中态是「渐变底 + 左侧 3px 竖条」**，规则写在 `src/style.css` 而不是组件里：  
  收起态的子菜单弹出层挂在 `<body>` 下、主菜单与底部菜单又是两个 `el-menu` 实例，  
  scoped 样式顾不全这三处。Element 默认的「整行稍微变亮」在深色栏上几乎看不出来。
- **待办徽标**：`商户管理` 显示待审核数（琥珀色）、`到期预警` 显示到期数（红色），  
  数据复用 `QUERY_KEYS.dashboard` 那份 overview —— 同一个 key，进看板时不会多发一次请求；  
  没有 `platform:dashboard:read` 的账号不查也不显示。收起态 `#title` 槽被 Element 隐藏，  
  所以数字 pill 在那里等于没有，收起时改在图标右上角点一个同色小圆点。
- 导航**不用 canvas 类图表库渲染**：菜单必须是真实 DOM（可 Tab 聚焦、读屏可读、权限变化后重排），  
  图表引擎在这件事上只会给更差的结果。

## 容器化部署

镜像自带 nginx：既托管 `dist` 静态产物，也把 `/api` 与 `/uploads` 反代到后端。  
**因此构建产物里不含任何后端地址**（接口只用相对路径 `/api/v1`），换环境不用重新构建。

```bash
docker build -t ye-dc/admin-web:latest .
docker run -e API_UPSTREAM=http://api:8000 -e UPLOADS_UPSTREAM=http://api:8000 -p 8081:80 ye-dc/admin-web:latest
```

- `API_UPSTREAM`：后端 API 地址，容器编排里通常填服务名（`http://api:8000`）。
- `UPLOADS_UPSTREAM`：商户上传图片的地址（平台端只读展示商户 Logo/菜品图）；后端用对象存储/CDN 时指向对应地址。
- 网关已放开 `client_max_body_size 10m`、配了 SPA history fallback、`/assets/` 长缓存与 `index.html` 不缓存。

完整部署流程（含数据库迁移、探针、对象存储）见仓库根 `DEPLOY.md`。
