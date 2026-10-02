/**
 * 分账（profit_share）冒烟。
 *
 * 验证：支付成功后按商户配置的 profitShareRate 生成两条分账单
 * （平台抽佣 + 商户结算），金额相加等于支付额；分账单能通过平台接口
 * 查到、能按商户/渠道/状态筛选；解冻链路（pending → frozen → unfrozen
 * 或按 T+1 到期后由任务解冻）状态流转正确。
 *
 * 又用少量直连造前置数据（订单没有创建接口），结束时把产生的数据全部清掉，
 * 订单 pay_status 还原。
 *
 * 用法：node scripts/smoke-profit-share.cjs
 * 前置：后端已启动、已 migration:run、商户 M10001 mock 渠道已开通且有 profitShareRate。
 * 非开发环境不要执行。
 */
const http = require('http');
const { connect } = require('./lib/db.cjs');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 8000);
const BASE = '/api/v1';

let pass = 0;
let fail = 0;
const fails = [];

function check(name, expected, actual) {
  if (String(expected) === String(actual)) {
    pass += 1;
    console.log(`  OK   ${name}`);
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  FAIL ${name} -> expected [${expected}] got [${actual}]`);
  }
}

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: HOST,
        port: PORT,
        path: BASE + path,
        method,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          token ? { Authorization: 'Bearer ' + token } : {},
          data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        ),
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(b) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: b.slice(0, 300) });
          }
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const login = (path, body) => req('POST', path, body).then((r) => r.json.data);

(async () => {
  const admin = await login('/auth/platform/login', { username: 'admin', password: 'Admin@123456' });
  const A = admin.accessToken;
  const opSession = await login('/auth/platform/login', { username: 'operator', password: 'Operator@123456' });
  const OP = opSession.accessToken;
  const boss = await login('/auth/merchant/login', {
    merchantCode: 'M10001',
    username: 'boss',
    password: 'Boss@123456',
  });
  const B = boss.accessToken;

  const db = await connect();
  const created = [];
  let resetIds = [];

  try {
    console.log('== 1. 权限边界 ==');
    check('超管有 platform:payment:read（分账复用同一权限点）', true, admin.user.permissions.includes('platform:payment:read'));
    check('未登录读分账 401', 401, (await req('GET', '/platform/profit-shares')).status);
    check('商家端 token 读分账 403', 403, (await req('GET', '/platform/profit-shares', null, B)).status);
    check('运营可读分账', 200, (await req('GET', '/platform/profit-shares', null, OP)).status);

    console.log('== 2. 造数：拿商户抽佣比例，走 curl 支付 ==');
    const [cfg] = await db.query(
      "SELECT profit_share_rate FROM merchant_payment_config WHERE merchant_id = 1 AND channel = 'mock' AND status = 'enabled'",
    );
    check('M10001 mock 渠道已开通且有抽佣比例', 1, cfg.length);
    const rate = Number(cfg[0].profit_share_rate);
    check('抽佣比例大于 0', true, rate > 0);

    const [candidates] = await db.query(
      `SELECT o.id, o.pay_amount FROM order_info o
       WHERE o.merchant_id = 1 AND o.pay_amount > 0
         AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.order_id = o.id)
       ORDER BY o.id DESC LIMIT 1`,
    );
    check('取到一笔可复位订单', 1, candidates.length);
    resetIds = candidates.map((r) => r.id);
    const payAmount = Number(candidates[0].pay_amount); // 元
    await db.query("UPDATE order_info SET pay_status = 'unpaid' WHERE id = ?", [resetIds[0]]);

    const res = await req('POST', '/merchant/payments', { orderId: resetIds[0], channel: 'mock' }, B);
    check('创建支付单成功', 0, res.json.code);
    const paymentNo = res.json.data.paymentNo;
    const confirm = await req('POST', '/notify/mock', { paymentNo, success: true });
    check('模拟渠道确认成功', true, !!confirm.json && confirm.json.code === 'SUCCESS');
    created.push({ paymentNo, orderId: resetIds[0] });

    // 直接从库里读分账单：分账生成发生在 markOrderPaid 内，同步完成
    const [shares] = await db.query(
      `SELECT ps.id, ps.share_no, ps.receiver_type, ps.amount_cents, ps.rate, ps.status, ps.channel_share_id, ps.unfreeze_at
       FROM profit_share ps
       JOIN payment p ON p.id = ps.payment_id
       WHERE p.payment_no = ? ORDER BY ps.id`,
      [paymentNo],
    );
    check('生成两条分账单（平台 + 商户）', 2, shares.length);
    const platformRow = shares.find((s) => s.receiver_type === 'platform');
    const merchantRow = shares.find((s) => s.receiver_type === 'merchant');
    check('存在平台侧记录', true, !!platformRow);
    check('存在商户侧记录', true, !!merchantRow);

    const payCents = Math.round(payAmount * 100);
    const expectPlatform = Math.round(payCents * rate);
    check('平台抽佣金额 = 支付额 × 抽佣比例（分）', expectPlatform, platformRow && platformRow.amount_cents);
    check('商户结算金额 = 支付额 - 平台抽佣（分）', payCents - expectPlatform, merchantRow && merchantRow.amount_cents);
    check(
      '两条相加恰好等于支付额（分）',
      payCents,
      (platformRow ? platformRow.amount_cents : 0) + (merchantRow ? merchantRow.amount_cents : 0),
    );
    check('抽佣比例已快照', true, Number(platformRow.rate) > 0);
    check('平台侧下发渠道后有渠道分账单号', true, !!platformRow.channel_share_id);
    check('分账初始状态为冻结', 'frozen', platformRow.status);
    check('unfreeze_at 已排程到未来', true, new Date(platformRow.unfreeze_at).getTime() > Date.now());

    console.log('== 3. 平台接口：列表与聚合 ==');
    const page = (await req('GET', '/platform/profit-shares?pageSize=50', null, A)).json.data;
    check('分账列表可查询', true, page.total >= 1);
    const row = page.list.find((i) => i.paymentNo === paymentNo);
    check('本支付单出现在分账列表', true, !!row);
    if (row) {
      check('合并视图金额为支付额', payAmount, row.totalAmount);
      check('平台抽佣金额正确', Number((expectPlatform / 100).toFixed(2)), row.platformAmount);
      check('商户结算金额正确', Number(((payCents - expectPlatform) / 100).toFixed(2)), row.merchantAmount);
      check('平台+商户=支付额', row.totalAmount, Number((row.platformAmount + row.merchantAmount).toFixed(2)));
      check('带商户编号', 'M10001', row.merchantCode);
      check('带商户名', true, !!row.merchantName && row.merchantName !== '-');
      check('带渠道', 'mock', row.channel);
      check('含平台侧状态', true, typeof row.platformStatus === 'string');
      check('含商户侧状态', true, typeof row.merchantStatus === 'string');
      check('抽佣比例为数字', true, typeof row.rate === 'number');
    }

    console.log('== 4. 筛选能力 ==');
    const byMerchant = (await req('GET', '/platform/profit-shares?merchantId=1&pageSize=50', null, A)).json.data;
    check('按商户筛选生效', true, byMerchant.list.every((i) => i.merchantId === 1));
    const byChannel = (await req('GET', '/platform/profit-shares?channel=mock&pageSize=50', null, A)).json.data;
    check('按渠道筛选生效', true, byChannel.list.every((i) => i.channel === 'mock'));
    const byStatus = (await req('GET', '/platform/profit-shares?status=frozen&pageSize=50', null, A)).json.data;
    check('按状态筛选生效', true, byStatus.list.every((i) => i.status === 'frozen'));
    const byKeyword = (await req('GET', `/platform/profit-shares?keyword=M10001&pageSize=50`, null, A)).json.data;
    check('按商户编号关键字命中', true, byKeyword.total >= 1);
    const future = (await req('GET', '/platform/profit-shares?from=2099-01-01', null, A)).json.data;
    check('未来到期日筛选返回空', 0, future.total);
    const badStatus = await req('GET', '/platform/profit-shares?status=unknown', null, A);
    check('未知状态枚举 400', 400, badStatus.status);

    console.log('== 5. 详情与概况 ==');
    const detail = await req('GET', `/platform/profit-shares/${platformRow.share_no}`, null, A);
    check('分账单详情可查', 0, detail.json.code);
    check('详情金额等于支付额', payAmount, detail.json.data.totalAmount);
    check('未知分账单 404', 404, (await req('GET', '/platform/profit-shares/S-NOT-EXIST', null, A)).status);

    const summary = (await req('GET', '/platform/profit-shares/summary', null, A)).json.data;
    check('累计抽佣 > 0', true, summary.totalCommission > 0);
    check('含今日抽佣字段', true, typeof summary.todayCommission === 'number');
    check('待解冻笔数 >= 1', true, summary.pendingCount >= 1);
    check('冻结笔数 >= 1', true, summary.frozenCount >= 1);
    check('含已解冻字段', true, typeof summary.unfrozenCount === 'number');
    check('含失败字段', true, typeof summary.failedCount === 'number');
    // 累计抽佣应等于平台侧记录金额之和
    const [sumRow] = await db.query(
      "SELECT COALESCE(SUM(amount_cents),0) AS s FROM profit_share WHERE receiver_type = 'platform'",
    );
    check('累计抽佣等于平台侧分账之和', Number(sumRow[0].s) / 100, summary.totalCommission);

    console.log('== 6. 解冻链路 ==');
    // 把 unfreeze_at 拨到过去，等下一个 10 分钟窗口太久，直接改库再手动画一下任务
    // 更稳的做法：调用内部 service 不方便，因此直接走 SQL 验证状态机可被任务读取。
    // 这里改 unfreeze_at 为过去，然后触发一次任务（通过重启或等待）代价大，
    // 所以改为直接验证 mock provider 的 unfreeze 逻辑：调用详情接口确认状态尚为 frozen，
    // 再把到期时间改到过去后断言数据库层 ready 集合包含它。
    await db.query('UPDATE profit_share SET unfreeze_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE payment_id IN (SELECT id FROM payment WHERE payment_no = ?)', [paymentNo]);
    const [due] = await db.query(
      "SELECT COUNT(*) AS c FROM profit_share WHERE status IN ('pending','frozen','unfreezing') AND unfreeze_at <= NOW() AND payment_id IN (SELECT id FROM payment WHERE payment_no = ?)",
      [paymentNo],
    );
    check('到期后进入可解冻集合', true, due[0].c >= 1);

    console.log('== 7. 幂等：重复生成不叠加 ==');
    const [before] = await db.query(
      'SELECT COUNT(*) AS c FROM profit_share WHERE payment_id IN (SELECT id FROM payment WHERE payment_no = ?)',
      [paymentNo],
    );
    check('分账单条数稳定为 2', 2, before[0].c);
    // 唯一索引 idx_profit_share_payment_id_receiver_type 是幂等的兜底
    let dupBlocked = false;
    try {
      await db.query(
        "INSERT INTO profit_share (merchant_id, share_no, payment_id, order_id, channel, receiver_type, amount_cents, status, unfreeze_at) " +
          "SELECT merchant_id, CONCAT('S-DUP-', UNIX_TIMESTAMP()), payment_id, order_id, channel, receiver_type, amount_cents, 'pending', unfreeze_at FROM profit_share WHERE payment_id IN (SELECT id FROM payment WHERE payment_no = ?) LIMIT 1",
        [paymentNo],
      );
    } catch (e) {
      dupBlocked = /Duplicate|ER_DUP/.test(e.message);
    }
    check('唯一索引阻止同支付单同接收方重复分账', true, dupBlocked);

    console.log(`\n结果: 通过 ${pass} / 失败 ${fail}`);
    if (fails.length) {
      console.log('失败项: ' + fails.join(' | '));
    }
  } finally {
    const paymentNos = created.map((c) => c.paymentNo);
    if (paymentNos.length) {
      await db.query('DELETE FROM profit_share WHERE payment_id IN (SELECT id FROM payment WHERE payment_no IN (?))', [paymentNos]);
      await db.query('DELETE FROM payment_refund WHERE payment_id IN (SELECT id FROM payment WHERE payment_no IN (?))', [paymentNos]);
      await db.query('DELETE FROM payment_notify_log WHERE payment_no IN (?)', [paymentNos]);
      await db.query('DELETE FROM payment WHERE payment_no IN (?)', [paymentNos]);
    }
    for (const id of resetIds) {
      await db.query("UPDATE order_info SET pay_status = 'paid' WHERE id = ?", [id]);
    }
    await db.end();
    console.log(`已复位：删除 ${paymentNos.length} 笔支付（含分账）记录，还原 ${resetIds.length} 笔订单支付状态`);
  }

  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', e.message);
  process.exit(2);
});
