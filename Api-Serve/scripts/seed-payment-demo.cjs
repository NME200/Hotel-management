/**
 * 一次性演示数据：给平台端「支付流水」页造几笔真实记录，跑完不清理。
 *
 * 复用 mock 渠道两段式：create 后必须 POST /notify/mock（paymentNo 在请求体）才转 succeeded。
 * 为让页面有可看的内容，会额外：造一笔成功退款、一笔停在 paying 的单、一笔关单。
 *
 * 用法：node scripts/seed-payment-demo.cjs   （开发环境专用）
 */
const http = require('http');
const { connect } = require('./lib/db.cjs');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 8000);
const BASE = '/api/v1';

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
          } catch {
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
  const boss = await login('/auth/merchant/login', {
    merchantCode: 'M10001',
    username: 'boss',
    password: 'Boss@123456',
  });
  const B = boss.accessToken;
  const db = await connect();

  // 取 4 笔订单：3 笔走完支付（其中 1 笔退款），1 笔只创建停在 paying
  const [orders] = await db.query(
    'SELECT id, pay_amount FROM order_info WHERE merchant_id = 1 AND pay_amount > 0 ORDER BY id DESC LIMIT 4',
  );
  if (orders.length < 4) {
    console.log('订单不足 4 笔，先跑 pnpm db:seed');
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i];
    await db.query("UPDATE order_info SET pay_status = 'unpaid', status = 'pending' WHERE id = ?", [order.id]);
    const created = await req('POST', '/merchant/payments', { orderId: order.id, channel: 'mock' }, B);
    if (created.json.code !== 0) {
      results.push({ orderId: order.id, err: created.json.message });
      continue;
    }
    // 最后一笔故意停在 paying，用于观察「未完成」统计
    if (i === orders.length - 1) {
      results.push({ orderId: order.id, paymentNo: created.json.data.paymentNo, state: 'paying' });
      continue;
    }
    const confirm = await req('POST', '/notify/mock', { paymentNo: created.json.data.paymentNo, success: true });
    results.push({
      orderId: order.id,
      paymentNo: created.json.data.paymentNo,
      state: confirm.json && confirm.json.code === 'SUCCESS' ? 'succeeded' : 'confirm-failed',
    });
  }

  // 给第一笔成功支付发起一笔部分退款（mock 退款同步置 succeeded）
  const firstSucceeded = results.find((r) => r.state === 'succeeded');
  if (firstSucceeded) {
    const refund = await req(
      'POST',
      `/merchant/payments/order/${firstSucceeded.orderId}/refund`,
      { amount: 1, reason: '演示：菜品缺货部分退款' },
      B,
    );
    console.log(
      '退款结果:',
      refund.status,
      refund.json.code,
      refund.json.message,
      refund.json.data && refund.json.data.status,
    );
  }

  console.log('演示数据就绪：');
  for (const r of results) {
    console.log(' ', r.orderId, r.paymentNo, r.state, r.err || '');
  }
  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
