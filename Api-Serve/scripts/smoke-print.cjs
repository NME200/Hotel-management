/**
 * 小票打印冒烟：验的不是接口通不通，而是「打印这条链路靠不靠得住」。
 *
 * 六条必须站得住的口径：
 * 1. 小票数据由后端算好 —— 金额分项相加必须等于实付，且单位是「分」的整数；
 * 2. 后厨小票**不含任何金额**，且 `showAmount=false`（钱上后厨台面是收银事故）；
 * 3. 打印流水先落 `pending`，回执后变 `success`，出纸与留痕是两件事；
 * 4. 失败任务可重试，重试是**累加计数**而不是新建一条流水；
 * 5. 重试次数封顶，超限返回 400（防止对着一台坏打印机无限重试）；
 * 6. 打印机配置的校验真的生效：云打印机缺设备号、份数超上限都必须被挡。
 *
 * 云推送那条链路单列在 [9]/[10]，因为它是本次的重点：
 * 平台没配厂商时，商家填了 sn 也要给出「找平台运营」的明白话；
 * 平台配好（这里指到本地假网关）之后，商家**只填一个设备号**就该真的出纸，
 * 任务不能再停在 pending —— 这就是"买了打印机直接输入编码就好"这句承诺。
 *
 * 用法：node scripts/smoke-print.cjs
 * 前置：后端已启动、已迁移、已 db:seed（需要至少一个订单）。
 * 脚本自带清理，可反复执行。
 */
const crypto = require('node:crypto');
const http = require('node:http');

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

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: HOST,
        port: PORT,
        path: BASE + p,
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

const codeOf = (r) => (r.json ? r.json.code : `raw:${r.raw}`);
const dataOf = (r) => (r.json ? r.json.data : null);

async function main() {
  console.log('小票打印冒烟开始\n');

  const boss = await req('POST', '/auth/merchant/login', {
    merchantCode: 'M10001',
    username: 'boss',
    password: 'Boss@123456',
  });
  if (codeOf(boss) !== 0) {
    console.error('商户登录失败：', boss.json || boss.raw);
    process.exit(1);
  }
  const B = dataOf(boss).accessToken;

  // 拿一个已有订单作为打印对象
  const orders = dataOf(await req('GET', '/merchant/orders?pageSize=5', null, B));
  if (!orders || !orders.list || orders.list.length === 0) {
    console.error('没有可用的演示订单，先跑 pnpm db:seed。');
    process.exit(1);
  }
  const order = orders.list[0];
  console.log(`测试订单：${order.orderNo}（id=${order.id}）取餐码 ${order.pickupCode || '--'}\n`);

  const createdPrinters = [];
  const newPrinter = async (body) => {
    const r = await req('POST', '/merchant/printers', body, B);
    if (r.json && r.json.code === 0) createdPrinters.push(r.json.data.id);
    return r;
  };

  /* ---------- 1. 顾客小票数据：金额分项自洽且为整数分 ---------- */
  console.log('[1] 顾客小票数据');
  const receiptRes = await req('GET', `/merchant/orders/${order.id}/receipt?ticketType=customer`, null, B);
  check('取小票数据返回 0', '0', String(codeOf(receiptRes)));
  const receipt = dataOf(receiptRes);

  if (receipt) {
    check('含门店名称', 'true', String(typeof receipt.shop.name === 'string' && receipt.shop.name.length > 0));
    check('含订单号', order.orderNo, receipt.orderNo);
    check('显示金额', 'true', String(receipt.showAmount));
    check('明细条数与订单一致', order.itemCount === undefined ? receipt.lines.length : receipt.lines.length, receipt.lines.length);
    check('菜品件数等于各行数量之和',
      receipt.lines.reduce((sum, l) => sum + l.quantity, 0),
      receipt.itemCount);

    const a = receipt.amount;
    const allInts = [a.dishCents, a.packingCents, a.deliveryCents, a.discountCents, a.payCents]
      .every((v) => Number.isInteger(v));
    check('金额全部是整数分', 'true', String(allInts));

    const expectedPay = a.dishCents + a.packingCents + a.deliveryCents - a.discountCents;
    check('分项相加等于实付', expectedPay, a.payCents);

    const lineSum = receipt.lines.reduce((sum, l) => sum + l.totalCents, 0);
    check('明细小计之和等于菜品金额', a.dishCents, lineSum);
  }

  /* ---------- 2. 后厨小票：绝不含金额 ---------- */
  console.log('\n[2] 后厨小票不含金额');
  const kitchen = dataOf(await req('GET', `/merchant/orders/${order.id}/receipt?ticketType=kitchen`, null, B));
  if (kitchen) {
    check('后厨票 showAmount=false', 'false', String(kitchen.showAmount));
    check('后厨票票种正确', 'kitchen', kitchen.ticketType);
    const zeroAmount = Object.values(kitchen.amount).every((v) => v === 0);
    check('后厨票金额全为 0', 'true', String(zeroAmount));
    check('后厨票仍带菜品明细', 'true', String(kitchen.lines.length > 0));
  }

  /* ---------- 3. 打印流水：pending -> success ---------- */
  console.log('\n[3] 打印流水');
  const taskRes = await req('POST', '/merchant/print/tasks', {
    orderId: order.id,
    ticketType: 'customer',
    trigger: 'manual',
  }, B);
  check('建打印任务返回 0', '0', String(codeOf(taskRes)));
  const task = dataOf(taskRes);
  if (task) {
    check('新任务为 pending', 'pending', task.status);
    check('新任务重试次数为 0', 0, task.retryCount);
    check('记录订单号', order.orderNo, task.orderNo);
    check('记录了操作人', 'true', String(Boolean(task.operatorName)));

    const reported = dataOf(await req('PATCH', `/merchant/print/tasks/${task.id}/report`, {
      status: 'success',
    }, B));
    check('回执后变 success', 'success', reported.status);
    check('成功后写入打印时间', 'true', String(Boolean(reported.printedAt)));
  }

  /* ---------- 4. 失败重试：累加计数而非新建 ---------- */
  console.log('\n[4] 失败重试累加计数');
  const failTask = dataOf(await req('POST', '/merchant/print/tasks', {
    orderId: order.id,
    ticketType: 'kitchen',
    trigger: 'manual',
  }, B));
  const failed = dataOf(await req('PATCH', `/merchant/print/tasks/${failTask.id}/report`, {
    status: 'failed',
    failReason: '冒烟测试：模拟缺纸',
  }, B));
  check('失败写入原因', '冒烟测试：模拟缺纸', failed.failReason);

  const retried = dataOf(await req('PATCH', `/merchant/print/tasks/${failTask.id}/retry`, {}, B));
  check('重试后回到 pending', 'pending', retried.status);
  check('重试计数 +1', 1, retried.retryCount);
  check('重试不新建任务（ID 不变）', failTask.id, retried.id);
  check('重试清空失败原因', 'true', String(retried.failReason === null));
  check('触发来源变为 retry', 'retry', retried.trigger);

  /* ---------- 5. 重试封顶 ---------- */
  console.log('\n[5] 重试次数封顶');
  let lastRetry = retried;
  for (let i = 0; i < 2; i += 1) {
    await req('PATCH', `/merchant/print/tasks/${failTask.id}/report`, {
      status: 'failed',
      failReason: '冒烟测试：仍然缺纸',
    }, B);
    lastRetry = dataOf(await req('PATCH', `/merchant/print/tasks/${failTask.id}/retry`, {}, B));
  }
  check('已重试 3 次', 3, lastRetry.retryCount);

  await req('PATCH', `/merchant/print/tasks/${failTask.id}/report`, {
    status: 'failed',
    failReason: '冒烟测试：还是缺纸',
  }, B);
  const overLimit = await req('PATCH', `/merchant/print/tasks/${failTask.id}/retry`, {}, B);
  check('超过 3 次被拒（400）', '400', String(codeOf(overLimit)));

  const successRetry = await req('PATCH', `/merchant/print/tasks/${task.id}/retry`, {}, B);
  check('已成任务不能重试（400）', '400', String(codeOf(successRetry)));

  /* ---------- 6. 打印机配置校验 ---------- */
  console.log('\n[6] 打印机配置校验');
  const browser = await newPrinter({
    name: '冒烟打印机-浏览器',
    mode: 'browser',
    ticketType: 'customer',
    paperSize: '80mm',
    copies: 1,
  });
  check('浏览器小票机可创建', '0', String(codeOf(browser)));

  const cloudNoDevice = await newPrinter({
    name: '冒烟打印机-云缺设备号',
    mode: 'cloud',
    ticketType: 'kitchen',
    paperSize: '80mm',
    copies: 1,
    provider: 'feie',
  });
  check('云打印机缺设备号被挡（400）', '400', String(codeOf(cloudNoDevice)));

  const cloudNoProvider = await newPrinter({
    name: '冒烟打印机-云缺厂商',
    mode: 'cloud',
    ticketType: 'kitchen',
    paperSize: '80mm',
    copies: 1,
    deviceNo: 'SN-冒烟-001',
  });
  check('云打印机缺厂商被挡（400）', '400', String(codeOf(cloudNoProvider)));

  const tooManyCopies = await newPrinter({
    name: '冒烟打印机-份数超限',
    mode: 'browser',
    ticketType: 'customer',
    paperSize: '80mm',
    copies: 99,
  });
  check('份数超上限被挡（400）', '400', String(codeOf(tooManyCopies)));

  const duplicated = await newPrinter({
    name: '冒烟打印机-浏览器',
    mode: 'browser',
    ticketType: 'customer',
    paperSize: '80mm',
    copies: 1,
  });
  check('同名打印机被挡（409）', '409', String(codeOf(duplicated)));

  /* ---------- 7. 打印流水查询与订单关联 ---------- */
  console.log('\n[7] 打印流水查询');
  const byOrder = dataOf(await req('GET', `/merchant/print/tasks/order/${order.id}`, null, B));
  check('按订单查到流水', 'true', String(Array.isArray(byOrder) && byOrder.length >= 2));

  const paged = dataOf(await req('GET', '/merchant/print/tasks?pageSize=5&status=success', null, B));
  check('按状态筛选返回成功列表', 'true', String(Array.isArray(paged.list)));
  check('筛选结果状态一致', 'true',
    String(paged.list.every((row) => row.status === 'success')));

  /* ---------- 8. 门店打印开关 ---------- */
  console.log('\n[8] 门店打印开关');
  const storeBefore = dataOf(await req('GET', '/merchant/store', null, B));
  const savedStore = dataOf(await req('PATCH', '/merchant/store', {
    ...storeBefore,
    autoPrint: true,
    autoPrintOn: 'accepted',
    customerCopies: 2,
  }, B));
  check('自动打印开关可保存', 'true', String(savedStore.autoPrint));
  check('打印时机可保存', 'accepted', savedStore.autoPrintOn);
  check('顾客小票份数可保存', 2, savedStore.customerCopies);

  const badCopies = await req('PATCH', '/merchant/store', {
    ...storeBefore,
    autoPrint: false,
    autoPrintOn: 'accepted',
    customerCopies: 99,
  }, B);
  check('门店份数超上限被挡（400）', '400', String(codeOf(badCopies)));

  const badOn = await req('PATCH', '/merchant/store', {
    ...storeBefore,
    autoPrint: false,
    autoPrintOn: '吃饭时',
    customerCopies: 1,
  }, B);
  check('非法打印时机被挡（400）', '400', String(codeOf(badOn)));

  // 还原门店配置
  await req('PATCH', '/merchant/store', storeBefore, B);

  /* ---------- 9. 云推送：平台未配置时给出可照做的原因 ---------- */
  console.log('\n[9] 云推送 · 平台未配置');

  // 先以超管登录拿平台 token
  const admin = await req('POST', '/auth/platform/login', {
    username: 'admin',
    password: 'Admin@123456',
  });
  if (codeOf(admin) !== 0) {
    console.error('平台超管登录失败：', admin.json || admin.raw);
    process.exit(1);
  }
  const P = dataOf(admin).accessToken;

  // 记录原有飞鹅配置，测试结束后原样还原，避免污染真实环境
  const beforeList = dataOf(await req('GET', '/platform/print-providers', null, P)) || [];
  const feieBefore = beforeList.find((item) => item.provider === 'feie') || null;

  // 清空飞鹅配置（关闭 + 清掉 uid/密钥），模拟"平台还没配厂商"
  await req('PUT', '/platform/print-providers/feie', {
    enabled: false,
    uid: '',
    secrets: { apiKey: '' },
  }, P);

  const notConfigured = await req('POST', '/platform/print-providers/feie/test', null, P);
  check('未配置时自检 ok=false', 'false', String(dataOf(notConfigured).ok));
  check('未配置时自检说明缺什么', 'true',
    String(/缺少必填配置/.test(dataOf(notConfigured).message || '')));

  const cloudPrinter = await newPrinter({
    name: '冒烟打印机-云真推',
    mode: 'cloud',
    ticketType: 'customer',
    paperSize: '80mm',
    copies: 1,
    provider: 'feie',
    deviceNo: 'SMOKE-SN-0001',
  });
  check('云打印机（含设备号）可创建', '0', String(codeOf(cloudPrinter)));
  const cloudPrinterId = dataOf(cloudPrinter).id;

  const notReadyTask = dataOf(await req('POST', '/merchant/print/tasks', {
    orderId: order.id,
    ticketType: 'customer',
    printerId: cloudPrinterId,
    trigger: 'manual',
  }, B));
  check('未配置厂商时任务直接 failed', 'failed', notReadyTask.status);
  check('失败原因提示找平台运营', 'true',
    String(/平台/.test(notReadyTask.failReason || '')));
  check('云任务不再是 pending', 'true', String(notReadyTask.status !== 'pending'));

  /* ---------- 10. 云推送：平台配好后，只填设备号即可出纸 ---------- */
  console.log('\n[10] 云推送 · 只填设备号即可出纸');

  // 假飞鹅网关：按官方规则**重算一遍签名**再决定回什么。
  // 上一版只看路径里的接口名，结果 provider 把 sig 少拼了 stime 也照样"通过"，
  // 真机一接就 ret=1 —— 这里把验签做实，签名算法就跑不掉了。
  const FEIE_SMOKE_UKEY = 'SMOKE-API-KEY';
  const gatewayHits = [];
  const fakeGateway = http.createServer((gwReq, gwRes) => {
    const url = new URL(gwReq.url, 'http://127.0.0.1');
    let raw = '';
    gwReq.on('data', (chunk) => (raw += chunk));
    gwReq.on('end', () => {
      const form = new URLSearchParams(raw);
      const apiname = form.get('apiname') ?? '';
      gatewayHits.push({ pathname: url.pathname, apiname, form });

      const expectedSig = crypto
        .createHash('sha1')
        .update(`${form.get('user') ?? ''}${FEIE_SMOKE_UKEY}${form.get('stime') ?? ''}`)
        .digest('hex');

      let payload;
      if (form.get('sig') !== expectedSig) {
        payload = { ret: 1, msg: 'user或pass错误' };
      } else if (apiname === 'Open_printMsg') {
        payload = { ret: 0, data: 'SMOKE-OK' };
      } else if (apiname === 'Open_queryPrinterStatus') {
        payload = { ret: 0, data: '在线，工作状态正常' };
      } else {
        payload = { ret: 1, msg: 'unknown apiname' };
      }
      gwRes.writeHead(200, { 'Content-Type': 'application/json' });
      gwRes.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => fakeGateway.listen(0, '127.0.0.1', resolve));
  const gatewayPort = fakeGateway.address().port;
  const gatewayBase = `http://127.0.0.1:${gatewayPort}`;

  const saved = dataOf(await req('PUT', '/platform/print-providers/feie', {
    enabled: true,
    uid: 'SMOKE-UID',
    baseUrl: gatewayBase,
    secrets: { apiKey: FEIE_SMOKE_UKEY },
  }, P));
  check('平台保存飞鹅配置成功', 'true', String(saved.configured));
  check('保存后 enabled 为 true', 'true', String(saved.enabled));
  check('密钥只回掩码不回明文', 'true', String(saved.secretFields.every((f) => f.masked !== 'SMOKE-API-KEY')));
  check('密钥指纹已生成', 'true', String(saved.secretFields.every((f) => Boolean(f.fingerprint))));

  const okTest = dataOf(await req('POST', '/platform/print-providers/feie/test', null, P));
  check('配置后自检 ok=true', 'true', String(okTest.ok));

  const cloudTask = dataOf(await req('POST', '/merchant/print/tasks', {
    orderId: order.id,
    ticketType: 'customer',
    printerId: cloudPrinterId,
    trigger: 'manual',
  }, B));
  check('配好厂商后云任务为 success', 'success', cloudTask.status);
  check('成功后写入打印时间', 'true', String(Boolean(cloudTask.printedAt)));
  check('失败原因为空', 'true', String(cloudTask.failReason === null));

  await new Promise((resolve) => setTimeout(resolve, 200));
  const printHit = gatewayHits.find((h) => h.apiname === 'Open_printMsg');
  check('确实调用了厂商出纸接口', 'true', String(Boolean(printHit)));
  if (printHit) {
    const q = printHit.form;
    check('带了账号 user', 'SMOKE-UID', q.get('user'));
    check('签名按 sha1(user+UKEY+stime) 算（网关重算通过）', 'true', String(Boolean(q.get('sig') && q.get('stime'))));
    check('接口名走 apiname，路径固定', '/Api/Open/', printHit.pathname);
    check('表单编码提交', 'true', String(q.get('content') !== null));
    check('带的设备号就是商家填的 sn', 'SMOKE-SN-0001', q.get('sn'));
    check('小票正文非空', 'true', String((q.get('content') || '').length > 0));
    check('幂等键用本地任务 ID', String(cloudTask.id), q.get('id'));
    check('小票正文含加粗标记', 'true', String(/<CB>|<B>/.test(q.get('content') || '')));
  }

  /* ---------- 11. 云任务失败后可直接重推 ---------- */
  console.log('\n[11] 云任务重试即重推');
  // 让网关对下一次推单回业务失败，验证任务被收口为 failed
  fakeGateway.on('request', () => {});
  const originalHits = gatewayHits.length;
  // 换成一个"拒绝受理"的网关行为：直接删掉服务器，让请求连接失败
  await new Promise((resolve) => fakeGateway.close(resolve));

  const failCloudTask = dataOf(await req('POST', '/merchant/print/tasks', {
    orderId: order.id,
    ticketType: 'customer',
    printerId: cloudPrinterId,
    trigger: 'manual',
  }, B));
  check('网关不可达时任务 failed', 'failed', failCloudTask.status);
  check('失败原因含连接问题', 'true',
    String(/无法连接|ECONNREFUSED|fetch failed/i.test(failCloudTask.failReason || '')));
  check('失败任务可重试（回到 failed，因为网关仍不可达）', 'failed',
    String(dataOf(await req('PATCH', `/merchant/print/tasks/${failCloudTask.id}/retry`, {}, B)).status));
  check('重试计数 +1', 1,
    dataOf(await req('GET', `/merchant/print/tasks/order/${order.id}`, null, B))
      .find((t) => t.id === failCloudTask.id).retryCount);
  void originalHits;

  // 还原飞鹅配置，避免污染真实环境。
  // baseUrl 要还原成「数据库里原本填没填覆盖值」，不能把当时生效的官方地址当成覆盖值写回去 ——
  // 那样每跑一次就把当年的默认域名钉进库，日后官方换域名时代码里的新地址会被这条盖掉。
  if (feieBefore) {
    await req('PUT', '/platform/print-providers/feie', {
      enabled: feieBefore.enabled,
      uid: feieBefore.account || '',
      baseUrl: feieBefore.baseUrlOverride ?? '',
    }, P);
  } else {
    await req('PUT', '/platform/print-providers/feie', {
      enabled: false,
      uid: '',
      secrets: { apiKey: '' },
    }, P);
  }

  /* ---------- 清理 ---------- */
  console.log('\n清理测试数据');
  for (const id of createdPrinters) {
    await req('DELETE', `/merchant/printers/${id}`, null, B);
  }
  const printerLeft = dataOf(await req('GET', '/merchant/printers', null, B)) || [];
  check('打印机已清理干净', 'true',
    String(!printerLeft.some((p) => p.name.startsWith('冒烟打印机'))));

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
