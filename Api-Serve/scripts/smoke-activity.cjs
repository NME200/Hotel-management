/**
 * 运营位活动冒烟：商家端写接口 + 顾客端卡片合成，一条链跑通。
 *
 * 覆盖的重点不是「接口通不通」，而是三件容易写错的事：
 * 1. 商户改文案，顾客端拿到的字是不是立刻跟着变（证明前端不再拼文案）；
 * 2. 未到 startsAt / 已停用 的活动，顾客端必须看不到，商家端仍然列得出来；
 * 3. A 商户配的活动不能出现在 B 商户的门店里（租户键漏了就是数据串店）。
 *
 * 用法：node scripts/smoke-activity.cjs
 * 前置：后端已启动、已 pnpm db:seed、已跑过迁移、已 node scripts/seed-activity-demo.cjs。
 * 脚本自带清理，可反复执行。
 */
const http = require('http');

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

const codeOf = (r) => (r.json ? r.json.code : `raw:${r.raw}`);
const dataOf = (r) => (r.json ? r.json.data : null);
const login = (body) => req('POST', '/auth/merchant/login', body).then((r) => dataOf(r));

const pad = (value) => String(value).padStart(2, '0');

/** 后端按本地墙上时钟解析时间，这里必须给本地格式而不是 toISOString */
function localDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function tomorrow(hour) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return localDateTime(date);
}

/** 顾客端卡片里按来源找一张，source 是后端合成标记而不是商户填的字段。 */
function bySource(list, source) {
  return (list || []).filter((item) => item.source === source);
}

(async () => {
  const boss = await login({
    merchantCode: 'M10001',
    username: 'boss',
    password: 'Boss@123456',
  });
  const B = boss.accessToken;
  const other = await login({
    merchantCode: 'M10002',
    username: 'boss',
    password: 'Boss@123456',
  });
  const O = other.accessToken;
  const cashier = await login({
    merchantCode: 'M10001',
    username: 'cashier',
    password: 'Cashier@123',
  });
  const C = cashier.accessToken;

  const UNIQUE = `冒烟活动${Date.now() % 1000000}`;
  let createdId = null;

  // 上一次中途失败会留下 冒烟活动* 这张卡，先把它们清掉，免得脏数据影响断言
  const leftovers = dataOf(await req('GET', '/merchant/activities?pageSize=100&keyword=' + encodeURIComponent('冒烟活动'), null, B));
  for (const row of (leftovers ? leftovers.list : [])) {
    await req('DELETE', `/merchant/activities/${row.id}`, null, B);
  }

  console.log('\n[1] 权限与可见性');
  check('boss 有 activity:create', 'true', String(boss.user.permissions.includes('activity:create')));
  check('boss 有 activity:delete', 'true', String(boss.user.permissions.includes('activity:delete')));
  check('前台角色没有 activity:read', 'false', String(cashier.user.permissions.includes('activity:read')));

  console.log('\n[2] 新增：顾客端立刻能读到同一句话');
  const create = await req('POST', '/merchant/activities', {
    name: UNIQUE,
    slot: 'home',
    title: `${UNIQUE} 主标题`,
    subTitle: `${UNIQUE} 副标题`,
    icon: 'bolt',
    action: 'menu',
    sort: 5,
  }, B);
  check('创建返回 code=0', '0', codeOf(create));
  createdId = dataOf(create) ? dataOf(create).id : null;
  check('创建回来的 title 与提交一致', `${UNIQUE} 主标题`, dataOf(create) && dataOf(create).title);

  const homeAfterCreate = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  const mine = bySource(homeAfterCreate, 'activity').filter((item) => item.id === createdId);
  check('顾客端首页卡片数 = 1', '1', String(mine.length));
  check('顾客端标题原样下发', `${UNIQUE} 主标题`, mine[0] && mine[0].title);
  check('顾客端副标题原样下发', `${UNIQUE} 副标题`, mine[0] && mine[0].subTitle);
  check('按钮文案由后端给', '去点餐', mine[0] && mine[0].actionText);

  console.log('\n[3] 改文案：顾客端跟着变');
  const update = await req('PATCH', `/merchant/activities/${createdId}`, {
    title: `${UNIQUE} 改过的标题`,
  }, B);
  check('修改返回 code=0', '0', codeOf(update));
  const afterUpdate = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  const updated = bySource(afterUpdate, 'activity').filter((item) => item.id === createdId);
  check('顾客端读到改后的标题', `${UNIQUE} 改过的标题`, updated[0] && updated[0].title);

  console.log('\n[4] 生效时间：未到时间的活动顾客端看不到');
  const scheduled = await req('PATCH', `/merchant/activities/${createdId}`, {
    startsAt: tomorrow(10),
  }, B);
  check('设置未来开始时间 code=0', '0', codeOf(scheduled));
  const afterSchedule = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  check(
    '顾客端已看不到这条活动',
    '0',
    String(bySource(afterSchedule, 'activity').filter((item) => item.id === createdId).length),
  );
  const merchantList = dataOf(await req('GET', '/merchant/activities?keyword=' + encodeURIComponent(UNIQUE), null, B));
  check('商家端列表仍能看到这条', '1', String(merchantList ? merchantList.total : -1));

  console.log('\n[5] 时间校验');
  const badRange = await req('POST', '/merchant/activities', {
    name: `${UNIQUE}-坏时间`,
    slot: 'home',
    title: '坏时间',
    startsAt: tomorrow(20),
    endsAt: tomorrow(10),
  }, B);
  check('结束早于开始被挡', '400', String(badRange.status));
  const badSlot = await req('POST', '/merchant/activities', {
    name: `${UNIQUE}-坏位置`,
    slot: 'sidebar',
    title: '坏位置',
  }, B);
  check('未知展示位被挡', '400', String(badSlot.status));

  console.log('\n[6] 停用与启用');
  const disable = await req('PATCH', `/merchant/activities/${createdId}/status`, { status: 'disabled' }, B);
  check('停用 code=0', '0', codeOf(disable));
  const backToVisible = await req('PATCH', `/merchant/activities/${createdId}`, { startsAt: null }, B);
  check('清掉开始时间 code=0', '0', codeOf(backToVisible));
  const stillHidden = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  check(
    '停用后顾客端看不到',
    '0',
    String(bySource(stillHidden, 'activity').filter((item) => item.id === createdId).length),
  );
  await req('PATCH', `/merchant/activities/${createdId}/status`, { status: 'enabled' }, B);
  const visibleAgain = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  check(
    '启用后顾客端立刻可见',
    '1',
    String(bySource(visibleAgain, 'activity').filter((item) => item.id === createdId).length),
  );

  console.log('\n[7] 位置分流');
  await req('PATCH', `/merchant/activities/${createdId}`, { slot: 'mine' }, B);
  const mineSlot = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=mine'));
  check('mine 位读到了这条', '1', String(bySource(mineSlot, 'activity').filter((item) => item.id === createdId).length));
  check('mine 位有商户配置时不再下发会员日卡', '0', String(bySource(mineSlot, 'member_day').length));
  const homeSlot = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  check('换到 mine 后 home 位读不到这条', '0', String(bySource(homeSlot, 'activity').filter((item) => item.id === createdId).length));

  console.log('\n[8] 系统合成卡');
  const mineDefault = await req('PATCH', `/merchant/activities/${createdId}/status`, { status: 'disabled' }, B);
  check('再停用 code=0', '0', codeOf(mineDefault));
  const fallback = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=mine'));
  check('商户没有可用配置时下发会员日卡', '1', String(bySource(fallback, 'member_day').length));
  check('会员日卡跳到会员中心', 'member', fallback && fallback[0] && fallback[0].action);
  check('会员日卡文案带日期规则', 'true', String(/^会员日 · 每月 8\/18\/28 日$/.test(fallback[0].title)));
  const claimable = dataOf(await req('GET', '/client/coupons/claimable?merchantCode=M10001', null, B)) || [];
  const seededHome = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home'));
  const couponCard = bySource(seededHome, 'coupon');
  check(
    '有可领券时首页带领券卡',
    String(claimable.filter((item) => item.claimable).length > 0),
    String(couponCard.length > 0),
  );
  if (couponCard.length > 0) {
    check('领券卡按钮是去领券', '去领券', couponCard[0].actionText);
  }

  console.log('\n[9] 租户隔离');
  const otherHome = dataOf(await req('GET', '/client/activities?merchantCode=M10002&slot=home'));
  check(
    '别家门店读不到本商户活动',
    '0',
    String((otherHome || []).filter((item) => item.title.indexOf(UNIQUE) >= 0).length),
  );
  const otherList = dataOf(await req('GET', '/merchant/activities?keyword=' + encodeURIComponent(UNIQUE), null, O));
  check('别家商户列表为 0 条', '0', String(otherList ? otherList.total : -1));

  console.log('\n[10] 越权与免登录');
  const forbidden = await req('POST', '/merchant/activities', {
    name: `${UNIQUE}-越权`,
    slot: 'home',
    title: '越权',
  }, C);
  check('前台角色写入被挡', '403', String(forbidden.status));
  const noStore = await req('GET', '/client/activities?slot=home');
  check('顾客端缺门店参数被挡', '400', String(noStore.status));

  console.log('\n[11] 清理');
  const removed = await req('DELETE', `/merchant/activities/${createdId}`, null, B);
  check('删除 code=0', '0', codeOf(removed));
  const afterDelete = dataOf(await req('GET', '/merchant/activities?keyword=' + encodeURIComponent(UNIQUE), null, B));
  check('删除后列表为 0 条', '0', String(afterDelete ? afterDelete.total : -1));

  console.log(`\n结果：通过 ${pass}，失败 ${fail}${fails.length ? ' -> ' + fails.join(' | ') : ''}`);
  if (fail > 0) process.exit(1);
})().catch((error) => {
  console.error('脚本异常:', error.message);
  process.exit(1);
});
