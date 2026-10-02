/**
 * 对账（reconcile）冒烟。
 *
 * 验证：本地账与渠道账逐笔比对的能力——
 *  1) 权限边界（复用 platform:payment:read）
 *  2) 造一笔真实成功支付，补跑对账后能生成台账
 *  3) 可控差异：mock 渠道对「金额能被 100 整除」的订单多记 1 分，
 *     因此必然出 amount_mismatch 差异，且差异明细金额正确
 *  4) 台账汇总口径：渠道金额 = 本地金额 + 差异（金额一致时相等）
 *  5) 补跑幂等：重跑不新增台账行、不累积重复明细（唯一索引兜底）
 *  6) 状态筛选 / 日期筛选 / 未知枚举 400
 *
 * 又用少量直连造前置数据（订单没有创建接口），结束时把产生的数据全部清掉，
 * 订单 pay_status 还原。
 *
 * 用法：node scripts/smoke-reconcile.cjs
 * 前置：后端已启动、已 migration:run、商户 M10001 mock 渠道已开通。
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

/** 本地日期键 YYYY-MM-DD（不能用 toISOString，它是 UTC）。 */
function localDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

(async () => {
  const admin = await login('/auth/platform/login', {
    username: 'admin',
    password: 'Admin@123456',
  });
  const A = admin.accessToken;
  const opSession = await login('/auth/platform/login', {
    username: 'operator',
    password: 'Operator@123456',
  });
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
  const tradeDate = localDateKey(new Date());

  try {
    console.log('== 1. 权限边界 ==');
    check('未登录读对账 401', 401, (await req('GET', '/platform/reconciliations')).status);
    check('商家端 token 读对账 403', 403, (await req('GET', '/platform/reconciliations', null, B)).status);
    check('商家端 token 补跑对账 403', 403, (await req('POST', '/platform/reconciliations/run', { tradeDate }, B)).status);
    check('运营可读对账', 200, (await req('GET', '/platform/reconciliations', null, OP)).status);
    check(
      '运营可手动补跑',
      true,
      [200, 201].includes((await req('POST', '/platform/reconciliations/run', { tradeDate }, OP)).status),
    );

    console.log('== 2. 造数：一笔金额能被 100 整除的成功支付 ==');
    // mock 渠道的账单差异规则：金额能被 100 整除时渠道多记 1 分。
    // 所以要造差异，必须挑一笔分金额 % 100 === 0 的订单。
    const [candidates] = await db.query(
      `SELECT o.id, o.pay_amount FROM order_info o
       WHERE o.merchant_id = 1 AND o.pay_amount > 0
         AND ROUND(o.pay_amount * 100) % 100 = 0
         AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.order_id = o.id)
       ORDER BY o.id DESC LIMIT 1`,
    );
    check('取到一笔分金额整除 100 的订单', 1, candidates.length);
    if (candidates.length === 0) {
      throw new Error('没有可用于造差异的订单，先跑 pnpm db:seed');
    }
    resetIds = candidates.map((r) => r.id);
    const payAmount = Number(candidates[0].pay_amount);
    const payCents = Math.round(payAmount * 100);
    check('支付分金额整除 100（mock 会制造 +1 分差异）', 0, payCents % 100);

    await db.query("UPDATE order_info SET pay_status = 'unpaid' WHERE id = ?", [resetIds[0]]);
    const res = await req('POST', '/merchant/payments', { orderId: resetIds[0], channel: 'mock' }, B);
    check('创建支付单成功', 0, res.json.code);
    const paymentNo = res.json.data.paymentNo;
    const confirm = await req('POST', '/notify/mock', { paymentNo, success: true });
    check('模拟渠道确认成功', true, !!confirm.json && confirm.json.code === 'SUCCESS');
    created.push({ paymentNo, orderId: resetIds[0] });

    const [localRows] = await db.query(
      "SELECT amount_cents FROM payment WHERE payment_no = ? AND status = 'succeeded'",
      [paymentNo],
    );
    check('本地账已有该笔成功支付', 1, localRows.length);
    check('本地金额与订单一致（分）', payCents, localRows[0] && localRows[0].amount_cents);

    console.log('== 3. 手动补跑当日对账 ==');
    const run = await req('POST', '/platform/reconciliations/run', { tradeDate, channel: 'mock' }, A);
    check('补跑接口成功', true, [200, 201].includes(run.status));
    check('补跑有处理台账', true, run.json.data.handled >= 1);
    check('补跑回显对账日', tradeDate, run.json.data.tradeDate);
    check('补跑回显渠道', 'mock', run.json.data.channel);

    console.log('== 4. 台账生成与差异识别 ==');
    const list = (await req('GET', `/platform/reconciliations?from=${tradeDate}&to=${tradeDate}&pageSize=50`, null, A)).json.data;
    check('对账列表可查询', true, list.total >= 1);
    const row = list.list.find((i) => i.channel === 'mock' && i.merchantId === 1);
    check('本商户本渠道台账已生成', true, !!row);
    if (row) {
      // mock 渠道对「金额整除 100 分」的订单每笔多记 1 分。演示库里有 3 笔
      // 成功支付（¥90/¥70/¥116）都整除，所以差异笔数由库里历史数据决定，
      // 只断言「>= 1 且含本笔」，不去假设只有本笔。
      check('台账状态为 mismatch（mock 必然多记差额）', 'mismatch', row.status);
      check('差异笔数 >= 1', true, row.diffCount >= 1);
      check('差异金额 = 差异笔数 × 0.01 元', Number((row.diffCount * 0.01).toFixed(2)), Number(row.diffAmount.toFixed(2)));
      check('渠道笔数 >= 本地笔数', true, row.channelCount >= row.localCount);
      check('渠道金额 - 本地金额 = 差异金额', Number((row.channelAmount - row.localAmount).toFixed(2)), Number(row.diffAmount.toFixed(2)));
      check('本地账包含本次支付', true, row.localAmount >= payAmount - 0.001);
      check('带商户编号', 'M10001', row.merchantCode);
      check('带商户名', true, !!row.merchantName && row.merchantName !== '-');
      check('渠道账单标记为已下载', true, row.billDownloaded === true);
      check('已记录对账完成时间', true, !!row.reconciledAt);
      check('渠道手续费字段为数字', true, typeof row.channelFee === 'number');
      check('本地退款字段为数字（不冲抵交易额）', true, typeof row.localRefund === 'number');

      // 差异明细应与台账逐笔对应，且每笔都是「渠道比本地多 1 分」
      const detailAll = await req('GET', `/platform/reconciliations/${row.reconcileNo}`, null, A);
      const allDiffs = detailAll.json.data.details;
      check('明细里每笔差异都是 +1 分', true, allDiffs.every((d) => d.diffAmount === 0.01));
      check('明细差异合计 = 台账差异金额', Number(row.diffAmount.toFixed(2)), Number(allDiffs.reduce((s, d) => s + d.diffAmount, 0).toFixed(2)));
    }

    console.log('== 5. 差异明细 ==');
    const detail = await req('GET', `/platform/reconciliations/${row.reconcileNo}`, null, A);
    check('台账详情可查', 0, detail.json.code);
    const diffs = detail.json.data.details;
    check('详情带差异明细数组', true, Array.isArray(diffs));
    check('差异明细条数 = 台账差异笔数', row.diffCount, diffs.length);
    const mine = diffs.find((d) => d.outTradeNo === paymentNo);
    check('本笔支付出现在差异明细里', true, !!mine);
    if (mine) {
      check('差异类型为金额不一致', 'amount_mismatch', mine.diffType);
      check('渠道金额 = 本地金额 + 1 分', payCents + 1, Math.round(mine.channelAmount * 100));
      check('本地金额 = 支付额', payCents, Math.round(mine.localAmount * 100));
      check('差异金额为 0.01 元', 0.01, mine.diffAmount);
      check('差异说明含金额双端对比', true, /渠道.*本地/.test(mine.remark));
      check('关联到本地支付单 ID', true, mine.paymentId !== null);
      check('带本地交易号', true, !!mine.localTradeNo);
    }
    check('未知台账 404', 404, (await req('GET', '/platform/reconciliations/C-NOT-EXIST', null, A)).status);

    console.log('== 6. 补跑幂等 ==');
    const beforeCount = (await req('GET', `/platform/reconciliations?from=${tradeDate}&to=${tradeDate}&pageSize=50`, null, A)).json.data.total;
    await req('POST', '/platform/reconciliations/run', { tradeDate, channel: 'mock' }, A);
    const afterPage = (await req('GET', `/platform/reconciliations?from=${tradeDate}&to=${tradeDate}&pageSize=50`, null, A)).json.data;
    check('重跑不新增台账行', beforeCount, afterPage.total);
    const after = afterPage.list.find((i) => i.channel === 'mock' && i.merchantId === 1);
    check('重跑后差异笔数不变', row.diffCount, after.diffCount);
    const detail2 = (await req('GET', `/platform/reconciliations/${row.reconcileNo}`, null, A)).json.data;
    check('重跑不累积重复明细', diffs.length, detail2.details.length);
    const [dupCheck] = await db.query(
      `SELECT COUNT(*) AS c FROM payment_reconcile_detail WHERE reconcile_id = ? AND out_trade_no = ?`,
      [row.id, paymentNo],
    );
    check('库内该笔差异明细唯一', 1, dupCheck[0].c);

    console.log('== 7. 筛选与概况 ==');
    const byStatus = (await req('GET', '/platform/reconciliations?status=mismatch&pageSize=50', null, A)).json.data;
    check('按状态筛选生效', true, byStatus.list.every((i) => i.status === 'mismatch'));
    const byChannel = (await req('GET', '/platform/reconciliations?channel=mock&pageSize=50', null, A)).json.data;
    check('按渠道筛选生效', true, byChannel.list.every((i) => i.channel === 'mock'));
    const byMerchant = (await req('GET', '/platform/reconciliations?merchantId=1&pageSize=50', null, A)).json.data;
    check('按商户筛选生效', true, byMerchant.list.every((i) => i.merchantId === 1));
    const future = (await req('GET', '/platform/reconciliations?from=2099-01-01', null, A)).json.data;
    check('未来日期筛选返回空', 0, future.total);
    check('未知状态枚举 400', 400, (await req('GET', '/platform/reconciliations?status=unknown', null, A)).status);
    check('缺少 tradeDate 的补跑 400', 400, (await req('POST', '/platform/reconciliations/run', {}, A)).status);

    const summary = (await req('GET', '/platform/reconciliations/summary', null, A)).json.data;
    check('概况含最近对账日', tradeDate, summary.lastTradeDate);
    check('差异笔数 >= 1', true, summary.mismatchCount >= 1);
    check('差异金额 > 0', true, summary.diffAmount > 0);
    check('含平账/待处理/失败字段', true,
      typeof summary.balancedCount === 'number' &&
      typeof summary.pendingCount === 'number' &&
      typeof summary.failedCount === 'number');
    // 概况差异金额应等于库内 mismatch 台账的差异金额之和
    const [sumRow] = await db.query(
      "SELECT COALESCE(SUM(diff_amount_cents),0) AS s FROM payment_reconcile WHERE status = 'mismatch'",
    );
    check('概况差异金额等于库内合计', Number(sumRow[0].s) / 100, summary.diffAmount);

    console.log('== 8. 无渠道账单的日期不产生假台账 ==');
    const oldRun = await req('POST', '/platform/reconciliations/run', { tradeDate: '2020-01-01' }, A);
    check('无任何支付的历史日期补跑不报错', true, [200, 201].includes(oldRun.status));
    check('无数据日期处理台账数为 0', 0, oldRun.json.data.handled);
    const oldList = (await req('GET', '/platform/reconciliations?from=2020-01-01&to=2020-01-01', null, A)).json.data;
    check('无数据日期不产生台账行', 0, oldList.total);

    console.log(`\n结果: 通过 ${pass} / 失败 ${fail}`);
    if (fails.length) {
      console.log('失败项: ' + fails.join(' | '));
    }
  } finally {
    // 复位：先删明细（挂台账），再删台账，再删支付相关记录，最后还原订单
    const paymentNos = created.map((c) => c.paymentNo);
    await db.query("DELETE d FROM payment_reconcile_detail d LEFT JOIN payment_reconcile r ON r.id = d.reconcile_id WHERE r.trade_date = ?", [tradeDate]);
    await db.query('DELETE FROM payment_reconcile WHERE trade_date = ?', [tradeDate]);
    await db.query('DELETE FROM payment_reconcile WHERE trade_date = ?', ['2020-01-01']);
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
    console.log(`已复位：删除对账台账与明细，删除 ${paymentNos.length} 笔支付记录，还原 ${resetIds.length} 笔订单支付状态`);
  }

  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', e.message);
  process.exit(2);
});
