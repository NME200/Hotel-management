/**
 * 收银台（CM-web）后端链路冒烟。
 *
 * 验的是「收银员真能不能把钱收对、把桌管对」，七条口径：
 * 1. **登录闸门**：`/auth/cashier/login` 先验密码再判 `cashier:use`；
 *    密码对但没权限是 403，密码错是 401 —— 顺序反了就从状态码泄露了账号是否存在；
 *    而且 403 不能计入登录失败次数，否则收银员试两次就被锁 10 分钟。
 * 2. **金额只认后端**：`orders/preview` 与 `orders` 的应付必须一模一样，
 *    收银员报给顾客的价和落库的价不可能对不上。
 * 3. **堂食必须有桌**：不传桌位就 400；空闲桌下单要顺手开台，否则看板出现「有单但桌位空闲」。
 * 4. **付到款才发取餐码**：建单后 pickupCode 必须为空，现金收款成功才发号。
 * 5. **线下收款不分账**：现金/收款码的钱不经过渠道，platform 抽佣无处冻结，
 *    所以 `profit_share` 里不该有这笔单的行（这条接口不返回，只能直连库看）。
 * 6. **清台有守卫**：桌上还有未结账订单时必须拒绝，强制清台是收银员明确的选择。
 * 7. **权限分层**：`cashier:use` 只决定能不能进收银台，
 *    开台清台走 `table:operate` —— 服务员（waiter）没有收银权限但要能开台。
 *
 * 用法：node scripts/smoke-cashier.cjs
 * 前置：后端已启动、已 migration:run、已 pnpm db:seed（本店至少有一个在售菜品）。
 * 脚本自建一张「冒烟桌」和一个 waiter 账号并在结束时删除；
 * 测试订单以取消/全额退款收尾（营业额统计不计这两类），但支付流水会留在库里。
 */
const http = require('node:http');
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

function send(method, path, body, token) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 登录接口自带 10 次/分钟的节流（`auth` 命名节流器），本脚本要连登 11 次，
 * 连跑两轮必然撞上 429。撞上就等一个窗口再试，而不是把「被限流」当成断言失败。
 */
async function req(method, path, body, token) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await send(method, path, body, token);
    if (response.status !== 429 || !path.startsWith('/auth/')) return response;
    console.log(`  …… ${path} 被限流，等 20 秒重试（auth 节流器 10 次/分钟）`);
    await sleep(20_000);
  }
  return send(method, path, body, token);
}

const codeOf = (r) => (r.json ? r.json.code : `raw:${r.raw}`);
const msgOf = (r) => (r.json ? r.json.message : r.raw);
const dataOf = (r) => (r.json ? r.json.data : null);

async function login(merchantCode, username, password) {
  const r = await req('POST', '/auth/merchant/login', { merchantCode, username, password });
  return codeOf(r) === 0 ? dataOf(r).accessToken : null;
}

/** 两个「元」金额相加后是否仍等于第三个（金额以 decimal 下发，允许 1 分内的舍入）。 */
function cents(yuan) {
  return Math.round(Number(yuan) * 100);
}

function today() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function main() {
  console.log('收银台链路冒烟开始\n');

  const boss = await login('M10001', 'boss', 'Boss@123456');
  if (!boss) {
    console.error('商户老板账号登录失败，先跑 pnpm db:seed。');
    process.exit(1);
  }

  /* ---------- 0. 准备：冒烟桌 + 在售菜品 ---------- */
  const dishes = dataOf(await req('GET', '/merchant/dishes?status=on_sale&pageSize=10', null, boss));
  const dishList = (dishes && dishes.list) || [];
  if (!dishList.length) {
    console.error('本店没有在售菜品，无法测点单。');
    process.exit(1);
  }
  const dish = dishList.find((d) => !d.needChoose) || dishList[0];

  const tableNo = `SM${String(Date.now()).slice(-5)}`;
  // 上一轮如果中途崩掉，会把冒烟桌留在库里；先按区域标记清干净，避免污染真实桌位列表
  const leftovers = (dataOf(await req('GET', '/merchant/tables', null, boss)) || []).filter(
    (row) => row.area === '冒烟区域',
  );
  for (const row of leftovers) {
    await req('POST', `/merchant/tables/${row.id}/close`, { force: true }, boss);
    await req('DELETE', `/merchant/tables/${row.id}`, null, boss);
  }
  const tableRes = await req('POST', '/merchant/tables', { tableNo, area: '冒烟区域', seats: 4 }, boss);
  if (codeOf(tableRes) !== 0) {
    console.error('建冒烟桌失败：', msgOf(tableRes));
    process.exit(1);
  }
  const table = dataOf(tableRes);
  console.log(`冒烟桌：${table.tableNo}（id=${table.id}）  测试菜品：${dish.name}（id=${dish.id}）\n`);

  const cleanupOrderIds = [];
  const createdStaffIds = [];
  const db = await connect();

  /* ---------- 1. 登录闸门 ---------- */
  console.log('[1] 收银台登录闸门');
  const cashierRes = await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: 'cashier',
    password: 'Cashier@123',
  });
  check('收银员能进收银台', '0', codeOf(cashierRes));
  const C = dataOf(cashierRes).accessToken;

  const kitchenCashier = await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: 'kitchen',
    password: 'Kitchen@123',
  });
  check('后厨被挡在收银台外', '403', kitchenCashier.status);
  check('挡人的说法是权限不是密码', 'true', String(/收银台权限/.test(msgOf(kitchenCashier))));

  const kitchenMerchant = await req('POST', '/auth/merchant/login', {
    merchantCode: 'M10001',
    username: 'kitchen',
    password: 'Kitchen@123',
  });
  check('同一账号照常能进商家端', '0', codeOf(kitchenMerchant));

  const badPassword = await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: 'cashier',
    password: 'Wrong@12345',
  });
  check('密码错是 401 而不是 403', '401', badPassword.status);

  // 403 不该累加登录失败次数：连吃两次 403 后正确密码仍能登录
  await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: 'kitchen',
    password: 'Kitchen@123',
  });
  const after403 = await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: 'kitchen',
    password: 'Kitchen@123',
  });
  check('无权限的 403 不计入登录失败锁定', '403', after403.status);
  const cashierAgain = await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: 'cashier',
    password: 'Cashier@123',
  });
  check('收银员没被误锁', '0', codeOf(cashierAgain));

  // waiter：有 table:operate 但没有 cashier:use —— 能开台，进不了收银台
  const waiter = dataOf(
    await req(
      'POST',
      '/merchant/staffs',
      {
        username: `smwaiter${String(Date.now()).slice(-4)}`,
        password: 'Waiter@123',
        realName: '冒烟服务员',
        phone: '13800000099',
        role: 'waiter',
      },
      boss,
    ),
  );
  if (waiter) createdStaffIds.push(waiter.id);
  const waiterToken = waiter ? await login('M10001', waiter.username, 'Waiter@123') : null;
  check('服务员账号可建可登（商家端）', 'true', String(!!waiterToken));
  const waiterCashier = await req('POST', '/auth/cashier/login', {
    merchantCode: 'M10001',
    username: waiter.username,
    password: 'Waiter@123',
  });
  check('服务员进不了收银台', '403', waiterCashier.status);

  /* ---------- 2. 收款方式 ---------- */
  console.log('\n[2] 收款方式');
  const methods = dataOf(await req('GET', '/merchant/cashier/payment-methods', null, C));
  const cash = (methods || []).find((m) => m.channel === 'cash');
  const qr = (methods || []).find((m) => m.channel === 'offline');
  check('现金恒可用', 'true', String(!!cash && cash.available === true));
  check('现金需要找零输入', 'true', String(cash && cash.needChange === true));
  check('收款码恒可用', 'true', String(!!qr && qr.available === true));
  check('收款码不需要找零', 'true', String(qr && qr.needChange === false));
  const online = (methods || []).filter((m) => m.channel !== 'cash' && m.channel !== 'offline');
  check(
    '不可用的在线渠道都带明白话',
    'true',
    String(online.every((m) => m.available === true || (typeof m.reason === 'string' && m.reason.length > 0))),
  );
  // 线下渠道不进驻额配置：它们是「当面收完」，没有进件、没有渠道开关可对账
  const configsRaw = dataOf(await req('GET', '/merchant/payment-configs', null, boss));
  const configs = Array.isArray(configsRaw) ? configsRaw : (configsRaw && configsRaw.list) || [];
  check(
    '收款设置里不出现现金与收款码',
    'true',
    String(!configs.some((c) => c.channel === 'cash' || c.channel === 'offline')),
  );
  const kitchenMethods = await req('GET', '/merchant/cashier/payment-methods', null, dataOf(kitchenMerchant).accessToken);
  check('后厨令牌打收银接口被拒', '403', kitchenMethods.status);

  /* ---------- 3. 算价与建单 ---------- */
  console.log('\n[3] 算价与建单');
  const orderBody = {
    dineType: 'dine_in',
    tableId: table.id,
    peopleCount: 4,
    items: [{ dishId: dish.id, quantity: 2 }],
  };
  const preview = dataOf(await req('POST', '/merchant/cashier/orders/preview', orderBody, C));
  check('预览能算出价', 'true', String(!!preview && Number(preview.payAmount) > 0));
  check(
    '分项相加等于应付',
    cents(preview.payAmount),
    cents(preview.dishAmount) + cents(preview.packingAmount) + cents(preview.deliveryAmount) - cents(preview.discountAmount),
  );

  const noTable = await req('POST', '/merchant/cashier/orders', { ...orderBody, tableId: undefined }, C);
  check('堂食不选桌被拒', '400', noTable.status);
  check('提示要先选桌位', 'true', String(/先选择桌位/.test(msgOf(noTable))));

  const created = dataOf(await req('POST', '/merchant/cashier/orders', orderBody, C));
  check('建单成功', 'true', String(!!created && !!created.id));
  cleanupOrderIds.push(created.id);
  check('收银台开单即为已接单', 'accepted', created.status);
  check('支付状态独立于出餐状态', 'unpaid', created.payStatus);
  check('桌号由后端写入', table.tableNo, created.tableNo);
  check(
    '下单前后金额一致',
    cents(preview.payAmount),
    cents(created.payAmount),
  );
  const draftOrder = dataOf(await req('GET', `/merchant/orders/${created.id}`, null, C));
  check('未收款不发取餐码', 'null', String(draftOrder.pickupCode));

  const afterOrderTables = dataOf(await req('GET', '/merchant/tables', null, boss));
  const tableAfterOrder = afterOrderTables.find((t) => t.id === table.id);
  check('堂食下单自动开台', 'dining', tableAfterOrder.diningStatus);
  check('开台登记了人数', 4, tableAfterOrder.guestCount);
  check('开台时间已写入', 'true', String(!!tableAfterOrder.openedAt));

  /* ---------- 4. 会员认人 ---------- */
  console.log('\n[4] 按手机号认会员');
  const known = dataOf(await req('GET', '/merchant/cashier/members/lookup?phone=13511110001', null, C));
  check('本店会员能认出', 'true', String(!!known && !!known.memberId));
  check('认出来就不给提示', 'null', String(known && known.hint));
  check('手机号只回脱敏值', 'true', String(known.phoneMasked !== '13511110001' && /\*/.test(known.phoneMasked)));

  const unknown = await req('GET', '/merchant/cashier/members/lookup?phone=13599998888', null, C);
  check('查不到的手机号返回 null', 'null', String(dataOf(unknown)));
  check('查不到也是 0 不是报错', '0', codeOf(unknown));

  // 别店顾客（M10002 的会员）在本店只是散客：给提示，但不顺手建档
  const otherStore = dataOf(await req('GET', '/merchant/cashier/members/lookup?phone=13522220001', null, C));
  check('别店顾客认得出人', 'true', String(!!otherStore && !!otherStore.customerId));
  check('别店顾客不是本店会员', 'false', String(otherStore && otherStore.isMember));
  check('提示按原价结算', 'true', String(/原价/.test((otherStore && otherStore.hint) || '')));
  const [memberRows] = await db.query(
    'SELECT id FROM member WHERE merchant_id = ? AND customer_id = ?',
    [table.merchantId, otherStore.customerId],
  );
  check('查一次不会自动建会员档案', 0, memberRows.length);

  const badPhone = await req('GET', '/merchant/cashier/members/lookup?phone=abc', null, C);
  check('非法手机号被校验挡下', '400', badPhone.status);

  if (known) {
    const memberPreview = dataOf(
      await req('POST', '/merchant/cashier/orders/preview', { ...orderBody, memberId: known.memberId }, C),
    );
    check(
      '会员价不会高于散客价',
      'true',
      String(cents(memberPreview.payAmount) <= cents(preview.payAmount)),
    );
    check('命中会员价时后端给出标记', 'true', String(typeof memberPreview.memberPriced === 'boolean'));
  }

  /* ---------- 5. 现金收款 ---------- */
  console.log('\n[5] 现金收款');
  const payRes = await req('POST', '/merchant/payments', { orderId: created.id, channel: 'cash' }, C);
  check('现金收款创建即成功', '0', codeOf(payRes));
  const payment = dataOf(payRes);
  check('支付单状态为已支付', 'succeeded', payment.status);
  check('支付金额与订单一致（分）', cents(created.payAmount), cents(payment.amount ?? payment.payAmount));

  const paidOrder = dataOf(await req('GET', `/merchant/orders/${created.id}`, null, C));
  check('订单置为已支付', 'paid', paidOrder.payStatus);
  check('收款后才发取餐码', 'true', String(!!paidOrder.pickupCode));
  check('收款不推进出餐状态', 'accepted', paidOrder.status);

  const [shareRows] = await db.query('SELECT id FROM profit_share WHERE payment_id = ?', [payment.id]);
  check('线下收款不生成分账单', 0, shareRows.length);

  const againPay = await req('POST', '/merchant/payments', { orderId: created.id, channel: 'cash' }, C);
  check('已结清的单不能重复收款', 'true', String(codeOf(againPay) !== '0'));

  /* ---------- 6. 收款码 + 退款 ---------- */
  console.log('\n[6] 收款码收款与退款');
  const takeout = dataOf(
    await req(
      'POST',
      '/merchant/cashier/orders',
      { dineType: 'takeout', items: [{ dishId: dish.id, quantity: 1 }] },
      C,
    ),
  );
  check('自取单不需要桌位', 'true', String(!!takeout && takeout.tableNo === null));
  cleanupOrderIds.push(takeout.id);
  const qrPay = dataOf(await req('POST', '/merchant/payments', { orderId: takeout.id, channel: 'offline' }, C));
  check('收款码收款创建即成功', 'succeeded', qrPay.status);
  const refund = await req('POST', `/merchant/payments/order/${takeout.id}/refund`, { reason: '冒烟退款' }, C);
  check('线下收款可直接退款', '0', codeOf(refund));
  check('退款置为成功', 'succeeded', dataOf(refund).status);
  const refundedOrder = dataOf(await req('GET', `/merchant/orders/${takeout.id}`, null, C));
  check('全额退款后订单为已退款', 'refunded', refundedOrder.payStatus);

  /* ---------- 7. 清台守卫 ---------- */
  console.log('\n[7] 开台 / 清台');
  const busyTable = dataOf(
    await req('POST', '/merchant/tables', { tableNo: `${tableNo}B`, area: '冒烟区域', seats: 2 }, boss),
  );
  const openRes = await req('POST', `/merchant/tables/${busyTable.id}/open`, { guestCount: 3 }, C);
  check('开台成功', '0', codeOf(openRes));
  check('开台后为用餐中', 'dining', dataOf(openRes).diningStatus);
  check('开台记下人数', 3, dataOf(openRes).guestCount);

  const openAgain = await req('POST', `/merchant/tables/${busyTable.id}/open`, {}, C);
  check('重复开台被拒', '409', openAgain.status);

  const dineInOnBusy = dataOf(
    await req(
      'POST',
      '/merchant/cashier/orders',
      { dineType: 'dine_in', tableId: busyTable.id, items: [{ dishId: dish.id, quantity: 1 }] },
      C,
    ),
  );
  cleanupOrderIds.push(dineInOnBusy.id);
  const closeGuarded = await req('POST', `/merchant/tables/${busyTable.id}/close`, {}, C);
  check('桌上有未结账订单时拒绝清台', '409', closeGuarded.status);
  check('拒绝理由说明还有几笔', 'true', String(/未结账/.test(msgOf(closeGuarded))));

  const forceClose = await req('POST', `/merchant/tables/${busyTable.id}/close`, { force: true }, C);
  check('强制清台可放行', '0', codeOf(forceClose));
  check('清台后回到空闲', 'idle', dataOf(forceClose).diningStatus);
  check('清台抹掉人数', 'null', String(dataOf(forceClose).guestCount));
  check('清台抹掉开台时间', 'null', String(dataOf(forceClose).openedAt));

  const closeIdle = await req('POST', `/merchant/tables/${busyTable.id}/close`, {}, C);
  check('空闲桌不能再清台', '409', closeIdle.status);

  const kitchenOpen = await req(
    'POST',
    `/merchant/tables/${busyTable.id}/open`,
    { guestCount: 2 },
    dataOf(kitchenMerchant).accessToken,
  );
  check('后厨无 table:operate，开台被拒', '403', kitchenOpen.status);
  const waiterOpen = await req('POST', `/merchant/tables/${busyTable.id}/open`, { guestCount: 2 }, waiterToken);
  check('服务员可开台（table:operate 与收银权限解耦）', '0', codeOf(waiterOpen));
  const waiterClose = await req('POST', `/merchant/tables/${busyTable.id}/close`, { force: true }, waiterToken);
  check('服务员可清台', '0', codeOf(waiterClose));
  const waiterCreate = await req(
    'POST',
    '/merchant/cashier/orders',
    { dineType: 'takeout', items: [{ dishId: dish.id, quantity: 1 }] },
    waiterToken,
  );
  check('服务员不能替顾客开单（无 order:create）', '403', waiterCreate.status);

  await req('PATCH', `/merchant/tables/${busyTable.id}/status`, { status: 'disabled' }, boss);
  const openDisabled = await req('POST', `/merchant/tables/${busyTable.id}/open`, {}, C);
  check('停用的桌位不能开台', '400', openDisabled.status);

  /* ---------- 8. 今日订单汇总 ---------- */
  console.log('\n[8] 今日订单汇总');
  const range = `from=${today()}&to=${today()}`;
  const before = dataOf(await req('GET', `/merchant/orders/summary?${range}`, null, C));
  check('汇总含待收款口径', 'true', String(before && Number.isInteger(before.unpaidCount)));
  const unpaidDraft = dataOf(
    await req(
      'POST',
      '/merchant/cashier/orders',
      { dineType: 'takeout', items: [{ dishId: dish.id, quantity: 1 }] },
      C,
    ),
  );
  const after = dataOf(await req('GET', `/merchant/orders/summary?${range}`, null, C));
  check('未结账的单计入待收款', before.unpaidCount + 1, after.unpaidCount);
  check('收款不改变待收款以外的统计口径', 'true', String(after.turnover >= before.turnover));
  await req('PATCH', `/merchant/orders/${unpaidDraft.id}/status`, { status: 'cancelled', remark: '冒烟取消' }, C);
  const afterCancel = dataOf(await req('GET', `/merchant/orders/summary?${range}`, null, C));
  check('取消后不再催收款', before.unpaidCount, afterCancel.unpaidCount);
  check('取消单不计入营业额', 'true', String(afterCancel.turnover <= after.turnover));

  /* ---------- 9. 审计留痕 ---------- */
  console.log('\n[9] 审计留痕');
  const admin = await req('POST', '/auth/platform/login', { username: 'admin', password: 'Admin@123456' });
  const A = dataOf(admin).accessToken;
  for (const action of ['cashier.order.create', 'table.open', 'table.close']) {
    const audits = dataOf(
      await req('GET', `/platform/audits?action=${action}&pageSize=5&targetType=${action === 'cashier.order.create' ? 'order' : 'table'}`, null, A),
    );
    check(`审计能查到 ${action}`, 'true', String(!!audits && audits.list.length > 0));
  }

  /* ---------- 清理 ---------- */
  console.log('\n清理测试数据');
  for (const id of cleanupOrderIds) {
    await req('PATCH', `/merchant/orders/${id}/status`, { status: 'cancelled', remark: '冒烟清理' }, boss);
  }
  await req('POST', `/merchant/tables/${table.id}/close`, { force: true }, boss);
  await req('DELETE', `/merchant/tables/${table.id}`, null, boss);
  await req('DELETE', `/merchant/tables/${busyTable.id}`, null, boss);
  for (const id of createdStaffIds) {
    await req('DELETE', `/merchant/staffs/${id}`, null, boss);
  }
  const tablesLeft = dataOf(await req('GET', '/merchant/tables', null, boss)) || [];
  check('冒烟桌已删除', 'true', String(!tablesLeft.some((t) => t.area === '冒烟区域')));
  const staffsLeft = dataOf(await req('GET', '/merchant/staffs?pageSize=50', null, boss));
  check(
    '冒烟服务员已删除',
    'true',
    String(!((staffsLeft && staffsLeft.list) || []).some((s) => s.role === 'waiter' && s.username.startsWith('smwaiter'))),
  );
  await db.end();

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) {
    console.log('失败项：');
    for (const name of fails) console.log(`  - ${name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('冒烟脚本异常：', error);
  process.exit(1);
});
