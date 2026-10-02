/**
 * 商户抽佣（merchant_payment_config.profit_share_rate）冒烟。
 *
 * 验证平台端「商户管理 → 编辑」里分渠道设置抽佣比例的能力：
 * 详情接口下发各渠道抽佣、写入只对已进件渠道生效、0~10% 与 4 位小数的边界、
 * 只改抽佣也能提交、审计记录改前改后值、运营账号因缺 merchant:update 被拒，
 * 以及最关键的一条 —— 改费率不会改写历史分账单已快照的 rate。
 *
 * 又用少量直连造前置数据（进件没有平台侧创建接口），结束时把产生的数据全部清掉。
 *
 * 用法：node scripts/smoke-commission.cjs
 * 前置：后端已启动、已 migration:run。
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
const commissionOf = (detail, channel) =>
  (detail.commissions || []).find((item) => item.channel === channel);

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

  const db = await connect();
  const createdConfigIds = [];
  let originalRemark = null;
  let auditIds = [];

  const patch = (id, body, token) =>
    req('PATCH', `/platform/merchants/${id}`, body, token || A);
  const detailOf = (id) => req('GET', `/platform/merchants/${id}`, null, A).then((r) => r.json.data);

  try {
    console.log('== 1. 权限边界 ==');
    check('超管有 merchant:update', true, admin.user.permissions.includes('merchant:update'));
    check(
      '运营无 merchant:update',
      false,
      opSession.user.permissions.includes('merchant:update'),
    );
    check('未登录读商户详情 401', 401, (await req('GET', '/platform/merchants/1')).status);

    console.log('== 2. 造前置：给商户 1 建一条 wechat 进件 ==');
    const [existing] = await db.query(
      "SELECT id FROM merchant_payment_config WHERE merchant_id = 1 AND channel = 'wechat'",
    );
    let wechatCfgId = existing.length ? existing[0].id : null;
    if (wechatCfgId === null) {
      const [ins] = await db.query(
        `INSERT INTO merchant_payment_config
           (merchant_id, channel, status, channel_account, profit_share_rate,
            settle_account_name, contact_name, contact_phone,
            applied_at, applied_by_id, applied_by_name, audited_at, audited_by_id, audited_by_name,
            created_at, updated_at)
         VALUES (1, 'wechat', 'enabled', '1600000001', NULL,
                 '冒烟结算户', '冒烟联系', '13800000000',
                 NOW(), 1, '冒烟', NOW(), 1, 'admin', NOW(), NOW())`,
      );
      wechatCfgId = ins.insertId;
      createdConfigIds.push(wechatCfgId);
    }
    check('wechat 进件行就绪', true, wechatCfgId > 0);

    const [mRows] = await db.query('SELECT remark FROM merchant WHERE id = 1');
    originalRemark = mRows[0].remark;

    console.log('== 3. 详情下发各渠道抽佣 ==');
    const d0 = await detailOf(1);
    check('commissions 长度 2', 2, d0.commissions.length);
    check('含微信', 'wechat', commissionOf(d0, 'wechat').channel);
    check('微信 configured=true', true, commissionOf(d0, 'wechat').configured);
    check('微信渠道名下发', '微信支付', commissionOf(d0, 'wechat').channelLabel);
    check('含支付宝', 'alipay', commissionOf(d0, 'alipay').channel);
    check('支付宝 configured=false（未进件）', false, commissionOf(d0, 'alipay').configured);
    check('未进件支付宝 status=not_applied', 'not_applied', commissionOf(d0, 'alipay').status);

    console.log('== 4. 写入 happy path ==');
    const beforeRate = commissionOf(d0, 'wechat').profitShareRate;
    const set1 = await patch(1, { profitShareRates: { wechat: 0.0038 } });
    check('设置微信抽佣 200', 200, set1.status);
    check('响应回显 0.0038', 0.0038, commissionOf(set1.json.data, 'wechat').profitShareRate);
    const d1 = await detailOf(1);
    check('重新拉详情已落库 0.0038', 0.0038, commissionOf(d1, 'wechat').profitShareRate);

    console.log('== 5. 只对已进件渠道生效 ==');
    const alipayRes = await patch(1, { profitShareRates: { alipay: 0.005 } });
    check('对未进件支付宝写入被拒 400', 400, alipayRes.status);
    check(
      '错误提示含「进件」',
      true,
      String(alipayRes.json.message || '').includes('进件'),
    );
    const d2 = await detailOf(1);
    check('微信抽佣未被牵连', 0.0038, commissionOf(d2, 'wechat').profitShareRate);
    check('支付宝仍为未定价', null, commissionOf(d2, 'alipay').profitShareRate);

    console.log('== 6. 边界校验（0 ~ 10%，最多 4 位小数）==');
    check('11% 超上限被拒', 400, (await patch(1, { profitShareRates: { wechat: 0.11 } })).status);
    check('恰好 10% 通过', 200, (await patch(1, { profitShareRates: { wechat: 0.1 } })).status);
    const zeroRes = await patch(1, { profitShareRates: { wechat: 0 } });
    check('0（已定价不抽佣）通过', 200, zeroRes.status);
    check('0 存下来是 0 而非 null', 0, commissionOf(zeroRes.json.data, 'wechat').profitShareRate);
    check('负数被拒', 400, (await patch(1, { profitShareRates: { wechat: -0.01 } })).status);
    check(
      '5 位小数被拒',
      400,
      (await patch(1, { profitShareRates: { wechat: 0.00123 } })).status,
    );
    check('4 位小数通过', 200, (await patch(1, { profitShareRates: { wechat: 0.0038 } })).status);
    check(
      '非数字被拒',
      400,
      (await patch(1, { profitShareRates: { wechat: 'abc' } })).status,
    );

    console.log('== 7. 与资料字段同提交 / 仅抽佣提交 ==');
    const mixed = await patch(1, {
      remark: '__smoke_commission__',
      profitShareRates: { wechat: 0.004 },
    });
    check('同时改备注与抽佣 200', 200, mixed.status);
    check('备注已更新', '__smoke_commission__', mixed.json.data.remark);
    check('抽佣已更新 0.004', 0.004, commissionOf(mixed.json.data, 'wechat').profitShareRate);

    const onlyRate = await patch(1, { profitShareRates: { wechat: 0.0039 } });
    check('仅抽佣提交 200（不再报没有需要更新的字段）', 200, onlyRate.status);
    const emptyRes = await patch(1, {});
    check('空 body 仍报没有需要更新的字段', 400, emptyRes.status);

    console.log('== 8. 审计留痕 ==');
    const [auditRows] = await db.query(
      "SELECT id, action, detail FROM platform_audit WHERE action = 'payment.merchant.profit_share_rate' ORDER BY id DESC LIMIT 5",
    );
    auditIds = auditRows.map((r) => r.id);
    check('存在抽佣审计记录', true, auditRows.length > 0);
    const latestDetail = auditRows.length ? auditRows[0].detail : '';
    check('审计含改前值 from', true, String(latestDetail).includes('from'));
    check('审计含改后值 to', true, String(latestDetail).includes('to'));
    check('审计含渠道名', true, String(latestDetail).includes('wechat'));

    const auditApi = await req(
      'GET',
      '/platform/audits?page=1&pageSize=5&action=payment.merchant.profit_share_rate',
      null,
      A,
    );
    const rows = (auditApi.json.data && auditApi.json.data.list) || [];
    check('审计接口能按动作筛出抽佣记录', true, rows.length > 0);
    check('审计动作中文名正确', '调整商户抽佣比例', rows[0].actionLabel);

    console.log('== 9. 运营账号被拒 ==');
    check(
      '运营改抽佣 403',
      403,
      (await patch(1, { profitShareRates: { wechat: 0.009 } }, OP)).status,
    );
    const d3 = await detailOf(1);
    check('运营未改动抽佣', 0.0039, commissionOf(d3, 'wechat').profitShareRate);

    console.log('== 10. 改费率不改写历史分账单快照 ==');
    const [shareRows] = await db.query(
      'SELECT id, share_no, rate, amount_cents FROM profit_share ORDER BY id DESC LIMIT 1',
    );
    if (shareRows.length === 0) {
      console.log('  SKIP 无历史分账单，跳过快照验证');
    } else {
      const sample = shareRows[0];
      const oldRate = Number(sample.rate);
      const newRate = oldRate === 0.008 ? 0.0038 : 0.008;
      const changeRes = await patch(1, { profitShareRates: { wechat: newRate } });
      check('改费率 200', 200, changeRes.status);
      const [after] = await db.query(
        'SELECT rate, amount_cents FROM profit_share WHERE id = ?',
        [sample.id],
      );
      check('历史分账单 rate 快照未变', oldRate, Number(after[0].rate));
      check('历史分账单金额未变', sample.amount_cents, after[0].amount_cents);
      // 还原
      await patch(1, { profitShareRates: { wechat: beforeRate === null ? 0.0039 : beforeRate } });
    }

    console.log('== 11. 与进件页数据一致 ==');
    const [cfgRow] = await db.query(
      "SELECT profit_share_rate FROM merchant_payment_config WHERE merchant_id = 1 AND channel = 'wechat'",
    );
    check(
      'DB 中的抽佣与详情接口一致',
      true,
      cfgRow.length > 0,
    );
  } finally {
    console.log('== 清理 ==');
    // 抽佣值还原为空，进件行删掉
    for (const id of createdConfigIds) {
      await db.query('DELETE FROM merchant_payment_config WHERE id = ?', [id]);
    }
    if (auditIds.length) {
      await db.query('DELETE FROM platform_audit WHERE id IN (?)', [auditIds]);
    }
    await db.query('UPDATE merchant SET remark = ? WHERE id = 1', [originalRemark]);
    await db.end();
    console.log(`  已清理进件行 ${createdConfigIds.length} 条、抽佣审计 ${auditIds.length} 条`);
  }

  console.log('');
  console.log('========================================');
  console.log(` 通过 ${pass} / 失败 ${fail}`);
  if (fails.length) {
    console.log(' 失败项：');
    for (const name of fails) console.log('   - ' + name);
  }
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
