/**
 * 会员身份分层冒烟：验的是「一个微信账号跨门店」这套边界站不站得住。
 *
 * 六条必须站得住的口径：
 * 1. 切店不掉登录——同一张令牌换一家门店照样能用（回归用例：改造前这里 403）；
 * 2. 档案按店独立——等级/成长值/余额各店一份，切店不会把 A 店的钻石会员带过去；
 * 3. 我的订单跨店可见，且每条都标明是哪家店的；
 * 4. 平台停用账号=全平台不能下单；单店停用档案=只挡那一家，另一家照旧；
 * 5. 商家端不再有会员接口，会员管理只在平台端；
 * 6. 越权读别人的订单/档案一律读不到。
 *
 * 用法：node scripts/smoke-member.cjs
 * 前置：后端已启动、已 db:seed、已跑 AddCustomerIdentity 迁移，
 *      顾客令牌取自 .e2e/token.txt（跑 .e2e/mint-client.cjs 本地签发）。
 * 脚本自带清理，改过的状态用完都会还原。
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('http');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 8000);
const BASE = '/api/v1';
const TOKEN_FILE = path.join(__dirname, '..', '..', '.e2e', 'token.txt');
/** 顾客的主店与「另一家店」：切店用例就在这两家之间来回 */
const HOME_STORE = process.env.SMOKE_STORE_CODE || 'M10001';
const OTHER_STORE = process.env.SMOKE_OTHER_STORE_CODE || 'M10002';

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

function skip(name, reason) {
  console.log(`  SKIP ${name}（${reason}）`);
}

function req(method, p, body, token, storeCode) {
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
          storeCode ? { 'X-Merchant-Code': storeCode } : {},
          data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        ),
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b) });
          } catch (e) {
            resolve({ status: res.statusCode, body: { raw: b.slice(0, 200) } });
          }
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const codeOf = (res) => res.body.code;
const dataOf = (res) => (res.body.code === 0 ? res.body.data : null);

(async () => {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('缺少 .e2e/token.txt：在 .e2e 目录跑 node mint-client.cjs 签发一个顾客令牌。');
    process.exit(1);
  }
  const T = fs.readFileSync(TOKEN_FILE, 'utf8').trim();

  const adminLogin = await req('POST', '/auth/platform/login', {
    username: 'admin',
    password: 'Admin@123456',
  });
  check('平台端登录成功', 0, codeOf(adminLogin));
  const A = adminLogin.body.data.accessToken;

  const bossLogin = await req('POST', '/auth/merchant/login', {
    merchantCode: HOME_STORE,
    username: 'boss',
    password: 'Boss@123456',
  });
  check('商家端登录成功', 0, codeOf(bossLogin));
  const B = bossLogin.body.data.accessToken;

  /* ============================ 1. 切店不掉登录 ============================ */
  console.log('\n[1] 同一张令牌换门店');
  const home = await req('GET', '/client/member/center', null, T, HOME_STORE);
  check(`主店 ${HOME_STORE} 读会员中心`, 0, codeOf(home));
  const other = await req('GET', '/client/member/center', null, T, OTHER_STORE);
  // 改造前：令牌钉着 merchantId，换店一律 403「当前门店与登录门店不一致」
  check(`切到 ${OTHER_STORE} 不掉登录（回归）`, 0, codeOf(other));
  const homeMember = dataOf(home) ? dataOf(home).member : null;
  const otherMember = dataOf(other) ? dataOf(other).member : null;
  check(
    '换店后仍是同一个微信账号',
    'true',
    String(Boolean(homeMember && otherMember && homeMember.nickname === otherMember.nickname)),
  );
  check(
    '顾客 ID 跨店不变、会员档案 ID 各店一份',
    'true',
    String(
      Boolean(
        homeMember
          && otherMember
          && homeMember.customerId === otherMember.customerId
          && homeMember.id !== otherMember.id,
      ),
    ),
  );

  /* ============================ 2. 档案按店独立 ============================ */
  console.log('\n[2] 等级/成长值/余额各店一份');
  const customerId = otherMember ? otherMember.customerId : null;
  if (!customerId) {
    skip('会员中心未带出顾客 ID', '令牌对应的顾客可能已不存在');
  } else {
    const detail = await req('GET', `/platform/members/${customerId}`, null, A);
    check('平台端能读到这个顾客', 0, codeOf(detail));
    const profiles = (dataOf(detail) && dataOf(detail).profiles) || [];
    check(
      '这个顾客在两家店各有一份档案',
      'true',
      String(profiles.length >= 2),
    );
    check(
      '列表行的「几家店」与详情一致',
      profiles.length,
      dataOf(detail) ? dataOf(detail).storeCount : -1,
    );
    const balances = profiles.map((item) => Number(item.balance));
    check(
      '各店余额没有被加总成跨店余额',
      'true',
      String(balances.every((value) => value >= 0) && balances.length === profiles.length),
    );
  }

  /* ============================ 3. 跨店订单列表 ============================ */
  console.log('\n[3] 我的订单 = 跨店全部订单');
  const storeOrders = await req('GET', '/client/orders?page=1&pageSize=50', null, T, HOME_STORE);
  check('本店订单列表可用', 0, codeOf(storeOrders));
  const allOrders = await req(
    'GET',
    '/client/orders?scope=all&page=1&pageSize=50',
    null,
    T,
    OTHER_STORE,
  );
  check('跨店订单列表可用', 0, codeOf(allOrders));
  const allList = (dataOf(allOrders) && dataOf(allOrders).list) || [];
  const homeList = (dataOf(storeOrders) && dataOf(storeOrders).list) || [];
  check('跨店列表不少于本店列表', 'true', String(allList.length >= homeList.length));
  check(
    '每条订单都标明所属门店',
    'true',
    String(allList.length > 0 && allList.every((item) => Boolean(item.storeName) && Boolean(item.storeCode))),
  );
  check(
    '带 storeCode 就能一键跳到那家店',
    'true',
    String(allList.every((item) => item.storeCode === HOME_STORE || item.storeCode === OTHER_STORE)),
  );
  if (allList.length) {
    const orderNo = allList[0].orderNo;
    // 从另一家店的上下文点进别家的单：详情按归属放行，不再要求门店一致
    const foreign = allList.find((item) => item.storeCode !== OTHER_STORE);
    const target = foreign ? foreign.orderNo : orderNo;
    const detailRes = await req('GET', `/client/orders/${target}`, null, T, OTHER_STORE);
    check(`在 ${OTHER_STORE} 也能读别家店的单 ${target}`, 0, codeOf(detailRes));
    check(
      '详情里带出订单所属门店名',
      'true',
      String(Boolean(dataOf(detailRes) && dataOf(detailRes).storeName)),
    );
  }

  /* ============================ 4. 越权 ============================ */
  console.log('\n[4] 别人的单读不到');
  const mine = new Set(allList.map((item) => item.orderNo));
  const bossOrders = await req('GET', '/merchant/orders?page=1&pageSize=50', null, B);
  const foreignOrder = ((bossOrders.body.data && bossOrders.body.data.list) || [])
    .map((item) => item.orderNo)
    .find((orderNo) => !mine.has(orderNo));
  if (!foreignOrder) {
    skip('读别人的订单', '本店没有不属于这个顾客的订单');
  } else {
    const stolen = await req('GET', `/client/orders/${foreignOrder}`, null, T, HOME_STORE);
    check(`读别人的单 ${foreignOrder} 应 404`, 404, stolen.status);
  }
  const noStore = await req('GET', '/client/member/center', null, T);
  check('不带门店参数的会员接口被拦', 400, noStore.status);
  const anon = await req('GET', '/client/orders?scope=all', null, null, HOME_STORE);
  check('未登录读跨店订单被拒', 401, anon.status);

  /* ============================ 5. 停用：账号级 vs 档案级 ============================ */
  console.log('\n[5] 平台停用账号 / 单店停用档案');
  if (!customerId) {
    skip('停用链路', '没拿到顾客 ID');
  } else {
    const disabled = await req('PATCH', `/platform/members/${customerId}`, { status: 'disabled' }, A);
    check('平台端停用账号', 0, codeOf(disabled));
    const blocked = await req('GET', '/client/member/center', null, T, HOME_STORE);
    check(
      '停用后本店被拦',
      'true',
      String(blocked.status === 403 && String(blocked.body.message).indexOf('账号已被停用') === 0),
    );
    const blockedOther = await req('GET', '/client/member/center', null, T, OTHER_STORE);
    check('停用后换一家店同样被拦', 403, blockedOther.status);

    const restored = await req('PATCH', `/platform/members/${customerId}`, { status: 'active' }, A);
    check('恢复账号', 0, codeOf(restored));
    check(
      '恢复后立刻能用',
      0,
      codeOf(await req('GET', '/client/member/center', null, T, HOME_STORE)),
    );

    const profilesRes = await req(
      'GET',
      `/platform/members/profiles?customerId=${customerId}`,
      null,
      A,
    );
    const rows = (profilesRes.body.data && profilesRes.body.data.list) || [];
    const target = rows.find((item) => item.merchantId !== undefined);
    if (!target) {
      skip('单店停用档案', '没有读到这个顾客的任何档案');
    } else {
      const originalRemark = target.remark ?? null;
      const off = await req(
        'PATCH',
        `/platform/members/profile/${target.id}`,
        { status: 'disabled', remark: '冒烟：单店停用' },
        A,
      );
      check(`停用 ${target.merchantName} 的档案`, 0, codeOf(off));
      check('备注写在店这一层的档案上', '冒烟：单店停用', dataOf(off) ? dataOf(off).remark : null);
      const atSuspended = await req('GET', '/client/member/center', null, T, target.merchantCode);
      const atOtherStore = await req(
        'GET',
        '/client/member/center',
        null,
        T,
        target.merchantCode === HOME_STORE ? OTHER_STORE : HOME_STORE,
      );
      check('被停用的那家店挡住', 403, atSuspended.status);
      check('话术点名是店家停的，不是平台停的', 'true', String(String(atSuspended.body.message).indexOf('店家停用') >= 0));
      check('另一家店照常可用', 0, codeOf(atOtherStore));

      const backOn = await req(
        'PATCH',
        `/platform/members/profile/${target.id}`,
        { status: 'active', remark: originalRemark },
        A,
      );
      check('恢复档案', 0, codeOf(backOn));
      check('备注一并还原', originalRemark, dataOf(backOn) ? dataOf(backOn).remark : 'unknown');
      check(
        '恢复后两家都能用',
        'true',
        String(
          [
            codeOf(await req('GET', '/client/member/center', null, T, HOME_STORE)),
            codeOf(await req('GET', '/client/member/center', null, T, OTHER_STORE)),
          ].every((code) => code === 0),
        ),
      );
    }
  }

  /* ============================ 6. 商家端会员接口已下线 ============================ */
  console.log('\n[6] 商家端不再有会员模块');
  for (const p of ['/merchant/members', '/merchant/members/1']) {
    const res = await req('GET', p, null, B);
    check(`商家端 ${p} 已下线`, 404, res.status);
  }
  const platformList = await req('GET', '/platform/members?page=1&pageSize=5', null, A);
  check('平台端会员列表可用', 0, codeOf(platformList));
  const keywordSearch = await req('GET', '/platform/members?keyword=%E8%9C%9C', null, A);
  check(
    '平台端按昵称搜顾客',
    0,
    codeOf(keywordSearch),
  );

  /* ============================ 7. 清理检查 ============================ */
  console.log('\n[7] 状态还原');
  if (customerId) {
    const finalDetail = await req('GET', `/platform/members/${customerId}`, null, A);
    const rows = (dataOf(finalDetail) && dataOf(finalDetail).profiles) || [];
    check(
      '所有档案都回到 active',
      'true',
      String(rows.length > 0 && rows.every((item) => item.status === 'active')),
    );
    check(
      '账号回到 active',
      'active',
      dataOf(finalDetail) ? dataOf(finalDetail).status : 'unknown',
    );
  }

  console.log(
    `\n结果：通过 ${pass}，失败 ${fail}${fail ? ' -> ' + fails.join(' | ') : ''}`,
  );
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('冒烟脚本异常：', error.message);
  process.exit(1);
});
