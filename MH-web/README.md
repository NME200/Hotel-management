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

## 小票打印（`/order` 与 `/printer`）

打印分两处入口，职责刻意不重叠：

- **打票** 在订单模块：订单列表行有「打印」按钮（直接打顾客小票），订单详情抽屉里有「打印顾客小票 / 打印后厨小票 / 预览版面」，并列出本单的打印流水（票种、份数、打印机、状态、失败原因、操作人），失败的可一键重试。打票需 `print:create`，看流水需 `print:read`。
- **配置** 在「打印设置」（`/printer`）：打印机列表 + 打印流水两个页签。配打印机需 `printer:manage`。菜单与路由由 `print:read` 控制可见性。

几条约束：

- **小票上的每个数字都由后端算好**（`GET /merchant/orders/:id/receipt`），前端只做版面渲染，不做任何金额运算；金额字段一律是「分」的整数，仅经 `formatMoney` 换算展示。
- **后厨小票不含金额**：后端在该票种下把金额置 0 并返回 `showAmount=false`，前端据此不渲染金额区。这个判断在后端做，避免前端「忘了别显示」。
- 打印方式两种：**浏览器小票机**（`browser`，点打印即出纸，无需任何配置，走 `utils/print/printer.ts` 开独立窗口调 `window.print()`）、**云打印机**（`cloud`，只需选厂商 + 填机身设备号 sn，**厂商账号与密钥由平台侧统一配置，商家端不接触密钥**）。切回 `browser` 时表单会清掉设备号与厂商。
- 云打印机的出纸是**后端在建任务时就直接推给厂商网关**的：受理成功任务即 `success`，被拒或网关不可达即 `failed` 并带可照做的原因（例如「飞鹅账号 user 或 UKEY 不正确」「设备号不存在：先核对机身 SN，并确认这台机器已绑定到该账号下」）。因此云模式下前端**不再**调 `window.print()`、也不回执，避免覆盖后端已收口的结果。失败任务可在打印流水里一键重试（重试即重推，网关侧按任务 ID 幂等，不会重复出纸）。
- 出纸是异步的：浏览器模式下建任务先落 `pending`，前端打完回执 `PATCH .../report` 改 `success` / `failed`。浏览器打印对话框被用户取消时也会按失败回执，避免流水里出现假成功。
- **自动打印**在「门店设置 → 小票打印」里开关，可选「接单后」或「出餐时」触发，并设顾客小票默认份数（上限 5）。自动打印失败只记日志，不影响订单流转。
- 打印适配层在 `src/utils/print/`：`receipt-template.ts`（80/58mm 版面）、`printer.ts`（调起出纸）、`use-receipt-print.ts`（取数 → 建任务 → 出纸 → 回执，三处入口共用同一套流程）。

## 桌位管理（`/table`）

一桌一码：给每张桌子生成专属的微信小程序码，顾客扫码进店后订单自动带上桌号，不用手输。

- 看桌位与二维码需 `table:read`；新增/编辑/启停/重制码/删除需 `table:manage`（owner 与 manager 才有）。
  菜单可见性由 `table:read` 控制，前台也能看桌位与桌贴码。
- **二维码里存的是桌位凭据（`qrToken`）而不是桌号**，所以**改桌号不会让已贴在桌上的码失效**；
  反过来，「重制码」会换掉凭据、让旧码当场作废，因此有二次确认，且后端单独记一条审计。
- **制码失败不影响建桌**：平台还没配小程序 AppID/AppSecret、或小程序尚未发布时，
  桌位会正常创建但二维码为空，列表里显示「未生成」，配好后点该行的「重制码」补即可。
- 「批量建桌」给一个前缀 + 起始序号一次生成一串（如 `A01 ~ A10`，最多 50 张），
  已存在的桌号自动跳过而不是整批失败，生成结果会提示跳过了几个。
- 「批量打印二维码」把已有二维码拼成一张 A4 打印页在新窗口打开（三列网格，每格二维码 + 桌号），
  不引任何 PDF/打包库 —— 商家真正要的是贴到桌上，浏览器打印最省事。单张可用「下载」直接存图。
- 表格里的二维码缩略图可点开放大预览（`el-image` 的 `preview-src-list`）。
- **用餐状态（空闲 / 用餐中）与开台/清台**：列表里直接显示这张桌此刻有没有人在吃、
  开了多久、登记了几人。这一档权限是第三个点 `table:operate`（收银员与服务员都有），
  与 `table:manage` 分开 —— 翻台是前台的日常动作，改桌位与重制码是店长的动作。
  - 清台时如果桌上还有未结账订单，后端会拒绝并说明还有几笔；确需清台（顾客跑单）
    要在弹出的第二次确认里选「强制清台」，不会自动跳过检查。
  - 开台不建订单，只是把桌位置为「用餐中」。顾客扫码下单或收银台选桌点单都会自动补开台，
    所以手动开台只用于「人先坐下、菜还没点」的场景。
  - 完整的桌位看板（卡片视图、去点单）在收银台 `CM-web`，两端读写的是同一张 `store_table`。

## 数据看板（`/dashboard`）

与平台端同一套排版：概览条（数据截至 + 刷新，右侧「待处理订单」胶囊跳订单页）→ 四张 KPI → 主图 + 热销榜。
两处口径值得记住：

- **环比的「昨日」取趋势数组倒数第二项**（末项是今日），接口没有单独给昨日值，也不必为此加字段；
  上期为 0 时 `growthRate` 返回 null，卡片退回副文案而不是显示 `NaN%`。
- **热销榜是累计销量**（`dish.salesCount`），不是近 7 天销量，所以列表下面那句话必须留着 ——
  少了它，店长会以为这是本周爆款榜。

趋势图与 KPI 卡在 `views/dashboard/components/`，ECharts 按需注册（`echarts/core` + Bar/Line +
Grid/Legend/Tooltip + Canvas），只有这条懒加载路由多出约 190KB gzip，主包不变。

## 登录后落在哪个页面

落地页按权限挑：`/` 会重定向到当前账号**第一个有权限的菜单页**。
后厨与服务员没有 `dashboard:read`，写死跳数据看板会让人一进来就撞 403，看起来像登录失败。
顺序见 `src/router/routes.ts` 的 `MENU_ROUTES`（数据看板 → 订单 → 菜品 → … → 桌位 → 门店）。
若一个页面都没有权限才落到 `/403`。

## 目录结构

```
src/
├── api/          # 每个业务模块一个接口文件 + types/ 下的后端契约类型
├── components/   # 跨模块通用组件（状态标签、分页、图片地址录入）
├── constants/    # 字典（订单状态/就餐方式/菜品状态/会员等级/角色/权限/打印票种与状态/桌位状态）、菜单、接口与存储常量
├── layouts/      # DefaultLayout + 侧边菜单/顶栏/面包屑/改密码对话框
├── router/       # 静态路由表 + meta + 登录与权限守卫
├── stores/       # Pinia：auth（登录态与权限）、app（侧边栏状态）
├── utils/        # auth-storage（VueUse useLocalStorage）、format、validate、print/（小票版面与出纸）
└── views/        # login / dashboard / order / dish / category / member / staff / payment / printer / table / store / error
```

页面数据统一用 TanStack Vue Query 获取，mutation 成功后 `invalidateQueries` 使列表与看板缓存失效；
按钮与菜单可见性由后端下发的 `permissions`（如 `dish:create`）驱动，路由 `meta.permissions` 做页面级拦截，无权限跳 403。

## 侧边栏

菜单结构在 `src/constants/menu.ts`：`MENU_SECTIONS` 是「日常经营」（数据看板 / 订单 / 桌位）与
「菜品与营销」（菜品 / 分类 / 活动运营位 / 限时活动），`MENU_FOOTER_ITEMS` 是低频配置
（员工 / 收款 / 打印 / 门店），固定沉到窗口下沿并压暗一档。分组只是扫读单位，
可见性仍逐项按权限算，整组被清空时连标题一起隐藏（后厨只有一两项可见时不会看到一排空标题）。

- **`订单管理` 上的红色徽标是「待接单总数」**，取 `GET /merchant/orders?status=pending&pageSize=1` 的 `total`。
  不用看板接口里那个 `pendingOrderCount`，理由有两个：后厨与服务员没有 `dashboard:read`，
  而待接单恰恰是他们最该看到的一个数；且看板那个数与列表口径一致但要多拉一整份 overview。
  注意这是**全量待接单**，不是今日待接单。
- 选中态（渐变底 + 左侧竖条）与收起态规则统一写在 `src/style.css`：
  主菜单与底部菜单是两个 `el-menu` 实例，收起态弹层又挂在 `<body>` 下，组件内 scoped 顾不全。
- 收起态里数字 pill 不显示（`#title` 槽被 Element 隐藏），改在图标右上角点一个红点。

## 容器化部署

镜像自带 nginx：既托管 `dist` 静态产物，也把 `/api` 与 `/uploads` 反代到后端。
**因此构建产物里不含任何后端地址**（接口只用相对路径 `/api/v1`），换环境不用重新构建。

```bash
docker build -t ye-dc/mh-web:latest .
docker run -e API_UPSTREAM=http://api:8000 -e UPLOADS_UPSTREAM=http://api:8000 -p 8082:80 ye-dc/mh-web:latest
```

- `API_UPSTREAM`：后端 API 地址，容器编排里通常填服务名（`http://api:8000`）。
- `UPLOADS_UPSTREAM`：商户上传图片的地址。后端用对象存储/CDN 时指向对应地址。
- 网关已放开 `client_max_body_size 10m`（nginx 默认只放行 1MB，不放开会导致上传被网关直接挡掉）；
  已配 SPA history fallback、`/assets/` 长缓存与 `index.html` 不缓存。

完整部署流程（含数据库迁移、探针、对象存储）见仓库根 `DEPLOY.md`。

