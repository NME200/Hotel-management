/**
 * 平台端支付流水冒烟。
 *
 * 用 HTTP 接口验证业务行为；另用少量直连语句造前置数据——
 * 订单目前只来自种子数据（顾客自助下单随小程序一起接入），没有创建接口，
 * 而库里订单大多已被历史测试标成 paid，所以要先复位两笔才能走收款流程。
 * 结束时（第 8 节）会把这两笔订单的 pay_status 还原，并删掉本次产生的支付记录。
 *
 * 用法：node scripts/smoke-platform-payment.cjs
 * 前置：后端已启动、已 pnpm db:seed。非开发环境不要执行。
 *
 * 覆盖：权限边界、流水筛选、关键字三路匹配、分页、详情、通知日志、
 * 退款流水、概况口径、平台只读（不存在写接口）。
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

  try {
    console.log('== 1. 权限边界 ==');
    check('超管有 platform:payment:read', true, admin.user.permissions.includes('platform:payment:read'));
    check('运营有 platform:payment:read', true, opSession.user.permissions.includes('platform:payment:read'));
    check('运营可读全平台流水', 200, (await req('GET', '/platform/payments', null, OP)).status);
    check('未登录读流水 401', 401, (await req('GET', '/platform/payments')).status);
    // 带合法 token 但权限不足走 PermissionGuard，返回 403 而不是 401
    check('商家端 token 读流水 403', 403, (await req('GET', '/platform/payments', null, B)).status);
    check('商家端 token 读概况 403', 403, (await req('GET', '/platform/payments/summary', null, B)).status);
    check('商家端 token 读退款 403', 403, (await req('GET', '/platform/payments/refunds', null, B)).status);

    console.log('== 2. 造真实数据：复位订单后走 mock 收款 ==');
    // 必须挑"从没被支付过"的订单：库里可能已有演示数据或上轮遗留的支付/退款记录，
    // 拿一笔已退满的订单再去退款，后端会以"退款额超过支付额"正当拒绝（400），
    // 让测试看起来像挂了，其实是数据没隔离。
    const [candidates] = await db.query(
      `SELECT o.id FROM order_info o
       WHERE o.merchant_id = 1 AND o.pay_amount > 0
         AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.order_id = o.id)
       ORDER BY o.id DESC LIMIT 2`,
    );
    check('取到两笔可复位订单', 2, candidates.length);
    resetIds = candidates.map((r) => r.id);
    for (const id of resetIds) {
      await db.query("UPDATE order_info SET pay_status = 'unpaid' WHERE id = ?", [id]);
    }

    for (const id of resetIds) {
      const res = await req('POST', '/merchant/payments', { orderId: id, channel: 'mock' }, B);
      if (res.json.code !== 0) {
        continue;
      }
      const data = res.json.data;
      // mock 渠道是两段式：create 只把它置为 paying，必须再模拟一次渠道异步通知
      // 才变成 succeeded。真实渠道里这一步对应"顾客实际完成付款"，
      // 所以这一步不是测试的绕路，而是支付链路的必经环节。
      // 注意：notify 接口从**请求体**里读 paymentNo，不是从 query。
      const confirm = await req('POST', '/notify/mock', { paymentNo: data.paymentNo, success: true });
      created.push({
        paymentNo: data.paymentNo,
        orderId: id,
        confirmOk: confirm.json && confirm.json.code === 'SUCCESS',
      });
    }
    check('两笔支付均创建成功', 2, created.length);
    check('两笔支付均确认成功', 2, created.filter((c) => c.confirmOk).length);

    const listAfter = (await req('GET', '/platform/payments?pageSize=50', null, A)).json.data;
    check('平台能看到新产生的支付单', true, listAfter.total >= created.length);
    const row = listAfter.list.find((i) => i.paymentNo === created[0].paymentNo);
    check('新支付单出现在流水里', true, !!row);
    check('确认后状态为 succeeded', 'succeeded', row.status);
    check('流水带商户名', true, !!row && !!row.merchantName && row.merchantName !== '-');
    check('流水带商户编号', 'M10001', row.merchantCode);
    check('流水带订单号', true, !!row && !!row.orderNo);
    check('金额是数字且大于 0', true, typeof row.amount === 'number' && row.amount > 0);
    check('返回含需分账标记', true, typeof row.needProfitSharing === 'boolean');
    check('返回含通知计数', true, typeof row.notifyCount === 'number');
    check('平台流水不下发 payParams', true, !('payParams' in row));
    check('确认后有渠道交易号', true, !!row.tradeNo);
    check('确认后有支付时间', true, !!row.paidAt);

    console.log('== 3. 筛选能力 ==');
    const byMerchant = (await req('GET', `/platform/payments?merchantId=${row.merchantId}`, null, A)).json.data;
    check('按商户筛选只回该商户', true, byMerchant.list.every((i) => i.merchantId === row.merchantId));
    const byChannel = (await req('GET', '/platform/payments?channel=mock', null, A)).json.data;
    check('按渠道筛选生效', true, byChannel.list.every((i) => i.channel === 'mock'));
    const byStatus = (await req('GET', '/platform/payments?status=succeeded', null, A)).json.data;
    check('按状态筛选生效', true, byStatus.list.every((i) => i.status === 'succeeded'));
    const byOrderNo = (await req('GET', `/platform/payments?orderNo=${row.orderNo}`, null, A)).json.data;
    check('按订单号精确筛选', true, byOrderNo.total >= 1 && byOrderNo.list.every((i) => i.orderNo === row.orderNo));
    const byPayNo = (await req('GET', `/platform/payments?keyword=${row.paymentNo}`, null, A)).json.data;
    check('关键字命中支付单号', true, byPayNo.list.some((i) => i.paymentNo === row.paymentNo));
    const byMerchantName = (await req('GET', `/platform/payments?keyword=${encodeURIComponent(row.merchantName)}`, null, A)).json.data;
    check('关键字命中商户名', true, byMerchantName.total >= 1);
    const noMatch = (await req('GET', `/platform/payments?keyword=${encodeURIComponent('zzz不存在关键字')}`, null, A)).json.data;
    check('关键字无匹配返回空', 0, noMatch.total);
    // 用本地日期而不是 toISOString()：后者是 UTC，在东八区凌晨会算成前一天，
    // 导致"按今天筛选"实际查的是昨天。
    const today = localDateKey(new Date());
    const byRange = (await req('GET', `/platform/payments?from=${today}&to=${today}`, null, A)).json.data;
    check('按今天区间筛选能命中', true, byRange.total >= 1);
    const future = (await req('GET', '/platform/payments?from=2099-01-01', null, A)).json.data;
    check('未来日期返回空', 0, future.total);
    // 关键字三路"或"：搜支付单号时不能被商户名条件误杀
    check('关键字搜支付单号时不被商户条件误杀', true, byPayNo.total >= 1);
    const badChannel = await req('GET', '/platform/payments?channel=stripe', null, A);
    check('未知渠道枚举 400', 400, badChannel.status);

    console.log('== 4. 分页与详情 ==');
    const p1 = (await req('GET', '/platform/payments?page=1&pageSize=1', null, A)).json.data;
    check('分页 pageSize 生效', 1, p1.list.length);
    check('分页返回总数', true, p1.total >= 2);
    check('分页回显页码', 1, p1.page);
    check('分页回显 pageSize', 1, p1.pageSize);
    check('超大 pageSize 被拒 400', 400, (await req('GET', '/platform/payments?pageSize=9999', null, A)).status);
    const detail = await req('GET', `/platform/payments/${row.paymentNo}`, null, A);
    check('详情可查', 0, detail.json.code);
    check('详情带商户名', true, !!detail.json.data.merchantName);
    check('详情带渠道账户字段', true, 'channelAccount' in detail.json.data);
    check('未知支付单 404', 404, (await req('GET', '/platform/payments/P-NOT-EXIST', null, A)).status);
    const notifies = await req('GET', `/platform/payments/${row.paymentNo}/notifies`, null, A);
    check('通知日志接口可用', 0, notifies.json.code);
    check('通知日志是数组', true, Array.isArray(notifies.json.data));
    check('通知日志不含 apiV3 密钥名', false, JSON.stringify(notifies.json.data).includes('apiV3'));
    check('未知支付单通知 404', 404, (await req('GET', '/platform/payments/P-NOT-EXIST/notifies', null, A)).status);

    console.log('== 5. 退款流水 ==');
    // 对刚支付的那笔全额退款，制造真实退款流水
    const refund = await req('POST', `/merchant/payments/order/${created[0].orderId}/refund`, { reason: '冒烟测试退款' }, B);
    check('商家端退款成功', 0, refund.json.code);
    const refunds = (await req('GET', '/platform/payments/refunds?pageSize=50', null, A)).json.data;
    check('平台能看到退款流水', true, refunds.total >= 1);
    // 用本单自己的退款单号命中，不能用 orderId——同一订单可能有历史退款，
    // find(orderId) 会取到旧那条，断言就指向了别的支付单。
    const myRefundNo = refund.json.data && refund.json.data.refundNo;
    const rr = refunds.list.find((i) => i.refundNo === myRefundNo);
    check('退款流水命中本单', true, !!rr);
    if (rr) {
      check('退款流水带商户名', true, !!rr.merchantName && rr.merchantName !== '-');
      check('退款流水带原支付单号', created[0].paymentNo, rr.paymentNo);
      check('退款带原支付金额', true, typeof rr.totalAmount === 'number');
      check('退款金额不大于原额', true, rr.amount <= rr.totalAmount);
      const refundByMerchant = (await req('GET', `/platform/payments/refunds?merchantId=${rr.merchantId}`, null, A)).json.data;
      check('退款按商户筛选', true, refundByMerchant.list.every((i) => i.merchantId === rr.merchantId));
    }
    const refundByStatus = (await req('GET', '/platform/payments/refunds?status=succeeded', null, A)).json.data;
    check('退款按状态筛选', true, refundByStatus.list.every((i) => i.status === 'succeeded'));

    console.log('== 6. 概况口径 ==');
    const summary = (await req('GET', '/platform/payments/summary', null, A)).json.data;
    check('累计笔数 >= 2', true, summary.totalCount >= 2);
    check('累计金额 > 0', true, summary.totalAmount > 0);
    check('退款金额 > 0', true, summary.refundAmount > 0);
    check('退款笔数 >= 1', true, summary.refundCount >= 1);
    check('未完成笔数 >= 0', true, summary.openCount >= 0);
    check('含已关单字段', true, typeof summary.closedCount === 'number');
    check('含失败字段', true, typeof summary.failedCount === 'number');
    check('今日金额不超过累计', true, Number(summary.todayAmount) <= Number(summary.totalAmount) + 0.001);
    const succeededTotal = (await req('GET', '/platform/payments?status=succeeded&pageSize=1', null, A)).json.data.total;
    check('概况笔数与列表 succeeded 一致', succeededTotal, summary.totalCount);
    // 退款单独统计、不冲抵交易额：把成功支付金额加总，应与概况 totalAmount 相等，
    // 若退款被冲抵，这里的和就会小于概况值之外的预期。
    const succeededRows = (await req('GET', '/platform/payments?status=succeeded&pageSize=100', null, A)).json.data.list;
    const summed = Number(succeededRows.reduce((acc, i) => acc + i.amount, 0).toFixed(2));
    check('概况累计金额等于成功流水之和（退款不冲抵）', summed, summary.totalAmount);

    console.log('== 7. 平台只读：不存在写接口 ==');
    check(
      '平台无发起退款接口',
      true,
      [404, 405].includes((await req('POST', `/platform/payments/${row.paymentNo}/refund`, { amount: 1 }, A)).status),
    );
    check(
      '平台无创建支付接口',
      true,
      [404, 405].includes((await req('POST', '/platform/payments', { orderId: row.orderId, channel: 'mock' }, A)).status),
    );
    check(
      '平台无改支付状态接口',
      true,
      [404, 405].includes((await req('PATCH', `/platform/payments/${row.paymentNo}`, { status: 'succeeded' }, A)).status),
    );

    console.log(`\n结果: 通过 ${pass} / 失败 ${fail}`);
    if (fails.length) {
      console.log('失败项: ' + fails.join(' | '));
    }
  } finally {
    // 复位：删掉本次产生的支付/退款/通知记录，把订单 pay_status 还原成 paid
    // （这些订单原本就是 paid，是脚本为了造数才改成 unpaid 的）
    const paymentNos = created.map((c) => c.paymentNo);
    if (paymentNos.length) {
      // 分账单挂在 payment_id 上，必须先删（且要在删 payment 之前），
      // 否则会留下指向已删除支付单的孤儿分账，污染平台分账页。
      await db.query('DELETE FROM profit_share WHERE payment_id IN (SELECT id FROM payment WHERE payment_no IN (?))', [paymentNos]);
      await db.query('DELETE FROM payment_refund WHERE payment_id IN (SELECT id FROM payment WHERE payment_no IN (?))', [paymentNos]);
      await db.query('DELETE FROM payment_notify_log WHERE payment_no IN (?)', [paymentNos]);
      await db.query('DELETE FROM payment WHERE payment_no IN (?)', [paymentNos]);
    }
    for (const id of resetIds) {
      await db.query("UPDATE order_info SET pay_status = 'paid' WHERE id = ?", [id]);
    }
    await db.end();
    console.log(`已复位：删除 ${paymentNos.length} 笔支付记录，还原 ${resetIds.length} 笔订单支付状态`);
  }

  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', e.message);
  process.exit(2);
});
