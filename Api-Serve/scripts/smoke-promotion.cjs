/**
 * 限时活动冒烟：验的不是接口通不通，而是「钱到底怎么算的」。
 *
 * 四条必须站得住的口径：
 * 1. 活动价与会员价取低——同一行只按更便宜的一方成交；
 * 2. 优惠券照旧叠加，且抵扣基数是取低之后的实价；
 * 3. 菜单按门店缓存，但活动价是每次请求现算的，新建/停用立刻见效；
 * 4. 运营位卡关联的活动一旦删除或过期，卡片不能变成死链。
 *
 * 用法：node scripts/smoke-promotion.cjs
 * 前置：后端已启动、已 db:seed、已迁移；顾客令牌取自 .e2e/token.txt
 *      （跑 .e2e/mint-client.cjs 本地签发，或 .e2e/mint.cjs 走真实微信登录）。
 * 令牌不再绑门店，所以顾客端请求必须自己带 X-Merchant-Code——和小程序 request.uts 的行为一致。
 * 脚本自带清理，可反复执行。
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('http');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 8000);
const BASE = '/api/v1';
const TOKEN_FILE = path.join(__dirname, '..', '..', '.e2e', 'token.txt');
const CLIENT_STORE = process.env.SMOKE_STORE_CODE || 'M10001';

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
          p.startsWith('/client/') ? { 'X-Merchant-Code': CLIENT_STORE } : {},
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
const cents = (yuan) => Math.round(Number(yuan) * 100);

const pad = (value) => String(value).padStart(2, '0');

function localDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function daysFromNow(days, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return localDateTime(date);
}

/**
 * 菜单里挑测试菜：不要需要选规格的，也不要已经带活动的——
 * 演示数据本身就有活动（seed:activity），选中它们会让「取低」的比较对象变成未知数。
 */
function pickDishes(menu) {
  const all = (menu ? menu.categories : []).flatMap((category) => category.dishes);
  const sellable = all.filter(
    (dish) => !dish.soldOut && !dish.needChoose && (dish.promotionId ?? 0) === 0,
  );
  return {
    all,
    plain: sellable.find((dish) => cents(dish.memberDiscount || 0) === 0),
    membered: sellable.find((dish) => cents(dish.memberDiscount || 0) > 0),
  };
}

async function menuOf() {
  return dataOf(await req('GET', '/client/menu?merchantCode=M10001'));
}

async function findDish(dishId) {
  const menu = await menuOf();
  return menu.categories.flatMap((category) => category.dishes).find((dish) => dish.id === dishId);
}

async function checkout(T, body) {
  return dataOf(await req('POST', '/client/orders/checkout', body, T));
}

(async () => {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('缺少 .e2e/token.txt：先在 .e2e 目录跑 node mint.cjs 取一个真实顾客令牌。');
    process.exit(1);
  }
  const T = fs.readFileSync(TOKEN_FILE, 'utf8').trim();

  const boss = await req('POST', '/auth/merchant/login', {
    merchantCode: 'M10001',
    username: 'boss',
    password: 'Boss@123456',
  });
  const B = dataOf(boss).accessToken;

  // 上一次中断可能留下 冒烟活动* ，先清干净
  const leftovers = dataOf(await req('GET', '/merchant/promotions?pageSize=100&keyword=' + encodeURIComponent('冒烟活动'), null, B));
  for (const row of (leftovers ? leftovers.list : [])) {
    await req('PATCH', `/merchant/promotions/${row.id}/status`, { status: 'disabled' }, B);
    await req('DELETE', `/merchant/promotions/${row.id}`, null, B);
  }

  const picked = pickDishes(await menuOf());
  if (!picked.plain || !picked.membered) {
    console.error('种子数据里没有同时拿到「无会员价」和「有会员价」的菜品，无法验证取低口径。');
    process.exit(1);
  }
  const plain = picked.plain;
  const membered = picked.membered;
  console.log(`测试菜品：无会员价 ${plain.id}「${plain.name}」¥${plain.price}；`
    + `有会员价 ${membered.id}「${membered.name}」¥${membered.price} 会员¥${membered.memberPrice}`);

  const created = [];
  const newPromotion = async (body) => {
    const r = await req('POST', '/merchant/promotions', body, B);
    if (r.json && r.json.code === 0) created.push(r.json.data.id);
    return r;
  };

  console.log('\n[1] 活动价生效，且立刻反映在缓存菜单上');
  const promoPrice = Number((plain.price - 3).toFixed(2));
  const p1 = await newPromotion({
    name: '冒烟活动-特价',
    badge: '冒烟标',
    type: 'price',
    price: promoPrice,
    scopeType: 'dish',
    scopeIds: [plain.id],
  });
  check('创建成功', '0', codeOf(p1));
  const p1Id = dataOf(p1) ? dataOf(p1).id : null;
  const stamped = await findDish(plain.id);
  check('菜单里带上了活动 ID', String(p1Id), String(stamped && stamped.promotionId));
  check('菜单里活动价就是所填价格', String(promoPrice), String(stamped && stamped.promotionPrice));
  check('角标用商家填的字', '冒烟标', stamped && stamped.promotionBadge);

  const bill1 = await checkout(T, { dineType: 'dine_in', items: [{ dishId: plain.id, quantity: 2 }] });
  check('结算单价 = 活动价', String(promoPrice), bill1 && String(bill1.lines[0].unitPrice));
  check('该行标记为活动价生效', 'true', String(bill1 && bill1.lines[0].promotionPriced));
  check('菜品金额 = 活动价 × 2', String(promoPrice * 2), bill1 && String(bill1.dishAmount));

  console.log('\n[2] 活动价与会员价取低');
  // 比会员价还贵的活动：应当按会员价成交
  const worse = Number((Number(membered.memberPrice) + 1).toFixed(2));
  const p2 = await newPromotion({
    name: '冒烟活动-不如会员',
    type: 'price',
    price: worse,
    scopeType: 'dish',
    scopeIds: [membered.id],
  });
  const p2Id = dataOf(p2) ? dataOf(p2).id : null;
  const bill2 = await checkout(T, { dineType: 'dine_in', items: [{ dishId: membered.id, quantity: 1 }] });
  check('活动不如会员价时按会员价成交', String(membered.memberPrice), bill2 && String(bill2.lines[0].unitPrice));
  check('该行标记会员价生效', 'true', String(bill2 && bill2.lines[0].memberPriced));
  check('该行不标活动价', 'false', String(bill2 && bill2.lines[0].promotionPriced));

  // 改成比会员价便宜：应当翻到活动价
  const better = Number((Number(membered.memberPrice) - 1).toFixed(2));
  await req('PATCH', `/merchant/promotions/${p2Id}`, { price: better }, B);
  const bill3 = await checkout(T, { dineType: 'dine_in', items: [{ dishId: membered.id, quantity: 1 }] });
  check('活动更低时按活动价成交', String(better), bill3 && String(bill3.lines[0].unitPrice));
  check('该行翻成活动价生效', 'true', String(bill3 && bill3.lines[0].promotionPriced));
  check('不再标会员价', 'false', String(bill3 && bill3.lines[0].memberPriced));

  console.log('\n[3] 优惠券照旧叠加，抵扣基数是取低后的实价');
  // 用结算预览自己返回的 usableCoupons 选券：直接拿券列表里的第一张可能根本不满足门槛
  const preview = await checkout(T, { dineType: 'dine_in', items: [{ dishId: plain.id, quantity: 2 }] });
  const usableList = (preview && preview.usableCoupons ? preview.usableCoupons : []).filter(
    (item) => item.usable,
  );
  if (usableList.length === 0) {
    console.log('  SKIP 本单没有可用券，跳过叠加校验（跑 seed:client-demo 可补上）');
  } else {
    const withCoupon = await checkout(T, {
      dineType: 'dine_in',
      couponId: usableList[0].id,
      items: [{ dishId: plain.id, quantity: 2 }],
    });
    check('带券时菜品金额仍是活动价', String(promoPrice * 2), withCoupon && String(withCoupon.dishAmount));
    check('券确实抵扣了', 'true', String(withCoupon && withCoupon.discountAmount > 0));
    check('券抵扣额不超过菜品金额', 'true', String(withCoupon && withCoupon.discountAmount <= withCoupon.dishAmount));
    check(
      '实付 = 菜品 - 券抵扣',
      String(Number((withCoupon.dishAmount - withCoupon.discountAmount).toFixed(2))),
      String(withCoupon.payAmount),
    );
    check('结算页标出用了哪张券', usableList[0].name, withCoupon && withCoupon.usedCoupon && withCoupon.usedCoupon.name);
  }

  console.log('\n[4] 全场折扣与停用即时见效');
  await req('PATCH', `/merchant/promotions/${p1Id}/status`, { status: 'disabled' }, B);
  const afterDisable = await findDish(plain.id);
  check('停用后菜单不再带活动', 'null', String(afterDisable && afterDisable.promotionId));
  const bill4 = await checkout(T, { dineType: 'dine_in', items: [{ dishId: plain.id, quantity: 1 }] });
  check('停用后按原价成交', String(plain.price), bill4 && String(bill4.lines[0].unitPrice));

  const p3 = await newPromotion({
    name: '冒烟活动-全场6折',
    badge: '6折',
    type: 'discount',
    discount: 0.6,
    scopeType: 'all',
  });
  // 与后端同一套整数运算：先转万分比再整除，避免浮点把 46 的 6 折算成 27.59
  const fold = (yuan, scaledRatio) => Math.floor((cents(yuan) * scaledRatio) / 10000) / 100;
  const discounted = await findDish(plain.id);
  check('全场折扣按基础价算折后价', String(fold(plain.price, 6000)), String(discounted && discounted.promotionPrice));
  const bill5 = await checkout(T, { dineType: 'dine_in', items: [{ dishId: plain.id, quantity: 1 }] });
  check('折扣进结算', String(fold(plain.price, 6000)), bill5 && String(bill5.lines[0].unitPrice));

  console.log('\n[5] 时间窗');
  await req('PATCH', `/merchant/promotions/${dataOf(p3).id}`, {
    startsAt: daysFromNow(-2),
    endsAt: daysFromNow(-1),
  }, B);
  const expired = await findDish(plain.id);
  check('已过期活动不生效', 'null', String(expired && expired.promotionId));

  console.log('\n[6] 配错一律挡掉');
  check('按活动价却没给价格', '400', String((await req('POST', '/merchant/promotions', {
    name: '冒烟活动-坏1', type: 'price', scopeType: 'all',
  }, B)).status));
  check('按菜品范围却没给菜品', '400', String((await req('POST', '/merchant/promotions', {
    name: '冒烟活动-坏2', type: 'price', price: 1, scopeType: 'dish',
  }, B)).status));
  check('折扣不小于 1 被挡', '400', String((await req('POST', '/merchant/promotions', {
    name: '冒烟活动-坏3', type: 'discount', discount: 1.2, scopeType: 'all',
  }, B)).status));
  const fake = await newPromotion({
    name: '冒烟活动-假折扣',
    type: 'price',
    price: Number((plain.price + 5).toFixed(2)),
    scopeType: 'dish',
    scopeIds: [plain.id],
  });
  const fakeId = dataOf(fake) ? dataOf(fake).id : null;
  check('活动价不低于原价时按不参与处理', 'null', String((await findDish(plain.id)).promotionId === fakeId ? '写入' : 'null'));
  if (fakeId) await req('DELETE', `/merchant/promotions/${fakeId}`, null, B);

  console.log('\n[7] 运营位卡关联活动');
  // p1 在第 4 步被停用，这里重新启用，卡片才应当正常下发
  await req('PATCH', `/merchant/promotions/${p1Id}/status`, { status: 'enabled' }, B);
  const card = await req('POST', '/merchant/activities', {
    name: '冒烟卡-关联活动',
    slot: 'home',
    title: '今日特价菜',
    action: 'promotion',
    promotionId: p1Id,
  }, B);
  check('卡片创建成功', '0', codeOf(card));
  const cardId = dataOf(card) ? dataOf(card).id : null;
  const cards = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home')) || [];
  const linked = cards.find((item) => item.id === cardId);
  check('卡片带出活动 ID', String(p1Id), String(linked && linked.promotionId));
  check('按钮文案是去看活动', '去看活动', linked && linked.actionText);

  const blocked = await req('DELETE', `/merchant/promotions/${p1Id}`, null, B);
  check('被卡片关联的活动不允许直接删除', '409', String(blocked.status));

  await req('PATCH', `/merchant/promotions/${p1Id}`, {
    startsAt: daysFromNow(-2), endsAt: daysFromNow(-1),
  }, B);
  const cardsAfterExpire = dataOf(await req('GET', '/client/activities?merchantCode=M10001&slot=home')) || [];
  check('活动过期后卡片不再下发（避免死链）', 'false', String(cardsAfterExpire.some((item) => item.id === cardId)));

  await req('DELETE', `/merchant/activities/${cardId}`, null, B);
  const unlinked = await req('DELETE', `/merchant/promotions/${p1Id}`, null, B);
  check('解除关联后可以删除', '0', codeOf(unlinked));

  console.log('\n[8] 清理');
  for (const id of created) {
    await req('DELETE', `/merchant/promotions/${id}`, null, B);
  }
  const rest = dataOf(await req('GET', '/merchant/promotions?pageSize=100&keyword=' + encodeURIComponent('冒烟活动'), null, B));
  check('冒烟活动全部清干净', '0', String(rest ? rest.total : -1));
  const menuAfter = await menuOf();
  check('顾客端菜单已无冒烟活动', '0', String(
    menuAfter.categories.flatMap((category) => category.dishes).filter((dish) => dish.promotionBadge === '冒烟标').length,
  ));

  console.log(`\n结果：通过 ${pass}，失败 ${fail}${fails.length ? ' -> ' + fails.join(' | ') : ''}`);
  if (fail > 0) process.exit(1);
})().catch((error) => {
  console.error('脚本异常:', error.message);
  process.exit(1);
});
