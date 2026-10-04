/**
 * 顾客端（/client）接口冒烟。
 *
 * 覆盖的是「不需要顾客登录态就能验」的全部关键行为，重点是三类：
 * 1. 租户隔离：扫码参数决定看到哪家店的数据，跨店取详情必须 404；
 * 2. 令牌边界：后台令牌打顾客接口必须被拒，顾客令牌也用不了后台接口；
 * 3. 对外数据面：门店列表不泄漏商户内部字段，领券中心不出现停用/不进中心的券，
 *    平台端小程序配置接口永不回显 AppSecret。
 *
 * 下单算价、券核销、会员这些需要真实顾客令牌的路径这里覆盖不到：
 * 后端不提供任何模拟登录（DESIGN.md 支付按生产级别开发的要求），
 * 必须由平台先在「小程序配置」填入真实 AppID/AppSecret 后走微信换取 openid。
 *
 * 用法：node scripts/smoke-client.cjs
 * 前置：后端已启动、已 migration:run、已 pnpm db:seed 与 seed:client-demo。
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
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  FAIL ${name} -> expected [${expected}] got [${actual}]`);
  }
}

function ok(name) {
  pass += 1;
  console.log(`  OK   ${name}`);
}

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const request = http.request(
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
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(text), text });
          } catch (error) {
            resolve({ status: res.statusCode, body: null, text });
          }
        });
      },
    );
    request.on('error', reject);
    if (data) {
      request.write(data);
    }
    request.end();
  });
}

function codeOf(response) {
  return response.body == null ? 'no-body' : response.body.code;
}

function names(list) {
  return list.map((item) => item.name).join(',');
}

async function main() {
  console.log('== 1. 门店发现 ==');
  const stores = await req('GET', '/client/stores?page=1&pageSize=20');
  check('门店列表返回 0', 0, codeOf(stores));
  const list = stores.body.data.list;
  check('至少两家演示门店', 'true', String(list.length >= 2));
  check('含 M10001', 'true', String(list.some((item) => item.merchantCode === 'M10001')));
  check('含 M10002', 'true', String(list.some((item) => item.merchantCode === 'M10002')));
  const first = list[0];
  check('不泄漏商户内部 ID', 'undefined', String(first.merchantId));
  check('不泄漏联系人电话', 'undefined', String(first.contactPhone));
  check('不泄漏服务到期时间', 'undefined', String(first.expireAt));
  check('不泄漏门店主键 ID', 'undefined', String(first.id));
  check('下发三种就餐方式', 3, first.dineTypes.length);
  check('就餐方式带中文名', '堂食', first.dineTypes[0].label);
  check('统一响应体带 requestId', 'true', String(typeof stores.body.requestId === 'string'));

  const searchedStores = await req('GET', '/client/stores?page=1&pageSize=20&keyword=' + encodeURIComponent('面馆'));
  check('按门店名搜索命中', 'true', String(searchedStores.body.data.list.length >= 1));
  const searchedOther = await req('GET', '/client/stores?page=1&pageSize=20&keyword=' + encodeURIComponent('不存在的名'));
  check('搜索无命中返回空', 0, searchedOther.body.data.total);

  console.log('== 2. 扫码定店 ==');
  const context = await req('GET', '/client/context?merchantCode=M10001');
  check('上下文返回 0', 0, codeOf(context));
  check('是川味小馆', 'true', String(context.body.data.name.indexOf('川味') >= 0));
  check('演示门店处于营业中', 'true', String(context.body.data.openNow));
  const badContext = await req('GET', '/client/context?merchantCode=M99999');
  check('不存在的门店 404', 404, codeOf(badContext));
  const noContext = await req('GET', '/client/context');
  check('缺门店参数返回 400', 400, noContext.status);
  const noMenuParam = await req('GET', '/client/menu');
  check('菜单缺门店参数时给出中文引导', 'true', String(String(noMenuParam.body.message).indexOf('门店') >= 0));

  console.log('== 3. 菜单与租户隔离 ==');
  const menuA = await req('GET', '/client/menu?merchantCode=M10001');
  const menuB = await req('GET', '/client/menu?merchantCode=M10002');
  check('A 店菜单 0', 0, codeOf(menuA));
  check('B 店菜单 0', 0, codeOf(menuB));
  const catsA = menuA.body.data.categories;
  check('分类都不为空（空分类已隐藏）', 'true', String(catsA.every((cate) => cate.dishes.length > 0)));
  const dishesA = catsA.flatMap((cate) => cate.dishes);
  const dishesB = menuB.body.data.categories.flatMap((cate) => cate.dishes);
  check('A 店有在售菜品', 'true', String(dishesA.length >= 8));
  check('菜品价格都是正数', 'true', String(dishesA.every((dish) => dish.price > 0)));
  check('菜品都归属所在分类', 'true', String(dishesA.every((dish) => catsA.some((cate) => cate.id === dish.categoryId))));
  check('会员立减额与会员价自洽', 'true', String(dishesA.every((dish) =>
    dish.memberPrice === null ? dish.memberDiscount === 0 : Math.abs(dish.memberDiscount - (dish.price - dish.memberPrice)) < 0.001,
  )));
  check('带规格的菜标记 needChoose', 'true', String(dishesA.every((dish) => dish.needChoose === true || dish.skuCount === 0)));
  check('两店菜品 ID 不交叉', 'true', String(dishesA.every((dish) => !dishesB.some((other) => other.id === dish.id))));
  const seedImage = dishesA.find((dish) => dish.name === '水煮牛肉');
  // 本站相对路径就算合格：/static/dish/ 是种子里的本地图，/uploads/ 是商家自己上传的图，
  // 两种小程序都能直接 <image> 显示；要挡的是依赖外部 CDN 的外链。
  check(
    '演示菜品用的是本站图片',
    'true',
    String(seedImage !== undefined && /^\/(static|uploads)\//.test(String(seedImage.image))),
  );

  const dishId = dishesA[0].id;
  const own = await req('GET', `/client/dishes/${dishId}?merchantCode=M10001`);
  check('本店取本店菜品 0', 0, codeOf(own));
  const cross = await req('GET', `/client/dishes/${dishId}?merchantCode=M10002`);
  check('跨店取菜品 404（租户隔离）', 404, codeOf(cross));
  check('跨店取菜品不给任何数据', 'null', String(cross.body.data));

  const withSkus = await req('GET', '/client/dishes/1?merchantCode=M10001');
  check('详情返回份量规格', 'true', String(withSkus.body.data.skus.length >= 2));
  check('大份差价算得对', 20, withSkus.body.data.skus.find((sku) => sku.name === '大份').priceDelta);
  check('详情返回加料分组', 'true', String(withSkus.body.data.optionGroups.length >= 1));
  check('辣度是必选单选组', 'true', String(withSkus.body.data.optionGroups[0].required && withSkus.body.data.optionGroups[0].type === 'single'));
  check('搭配推荐排除自己', 'true', String(!withSkus.body.data.related.some((dish) => dish.id === 1)));
  const noMenu = await req('GET', '/client/menu');
  check('未扫码且未登录时拒绝列菜单', 400, codeOf(noMenu));

  const recommend = await req('GET', '/client/dishes/recommend?merchantCode=M10001');
  check('推荐位有条目', 'true', String(recommend.body.data.length >= 1));
  check('推荐位不超 6 个', 'true', String(recommend.body.data.length <= 6));
  const searched = await req('GET', '/client/dishes/search?merchantCode=M10001&keyword=' + encodeURIComponent('鸡'));
  check('搜「鸡」有命中', 'true', String(searched.body.data.length >= 2));
  check('搜索结果都属于本店', 'true', String(searched.body.data.every((dish) => dishesA.some((item) => item.id === dish.id))));
  const emptySearch = await req('GET', '/client/dishes/search?merchantCode=M10001&keyword=');
  check('空关键词返回空数组', 0, emptySearch.body.data.length);

  console.log('== 4. 领券中心（公开） ==');
  const claimable = await req('GET', '/client/coupons/claimable?merchantCode=M10001');
  check('领券中心返回 0', 0, codeOf(claimable));
  const items = claimable.body.data;
  check('可领券不主动券', 'true', String(items.length >= 4));
  check('停用的券模板不出现', 'false', String(items.some((item) => item.name === '满99减25元券')));
  check('不进中心的券不出现', 'false', String(items.some((item) => item.name === 'NEW2026 新客券')));
  check('券面大字由后端算好', 'true', String(items.every((item) => item.faceText.length > 0)));
  check('门槛文案齐备', 'true', String(items.every((item) => item.thresholdText.length > 0)));
  check('折扣券券面写「折」', 'true', String(items.filter((item) => item.type === 'discount').every((item) => item.faceText.indexOf('折') >= 0)));
  check('可领状态带提示字段', 'true', String(items.every((item) => 'claimTip' in item)));
  const claimableB = await req('GET', '/client/coupons/claimable?merchantCode=M10002');
  check('B 店只看得到自己的券', 'true', String(claimableB.body.data.every((item) => item.name.indexOf('满25减3') >= 0)));
  const couponMine = await req('GET', '/client/coupons/mine?status=unused');
  check('我的券未登录 401', 401, couponMine.status);

  console.log('== 5. 令牌边界 ==');
  const bossLogin = await req('POST', '/auth/merchant/login', {
    merchantCode: 'M10001',
    username: 'boss',
    password: 'Boss@123456',
  });
  check('商家端登录成功', 0, codeOf(bossLogin));
  const bossToken = bossLogin.body.data.accessToken;
  const guarded = [
    ['GET', '/client/member'],
    ['GET', '/client/member/center'],
    ['GET', '/client/orders?page=1&pageSize=10'],
    ['GET', '/client/payments/channels'],
    ['POST', '/client/orders'],
  ];
  for (const [method, path] of guarded) {
    const response = await req(method, path, method === 'POST' ? { dineType: 'dine_in', items: [{ dishId: 1, quantity: 1 }] } : null, bossToken);
    check(`后台令牌打 ${path} 被拒`, '403', String(response.body.code === 403 ? 403 : response.body.code));
    check(`${path} 拒绝话术点名顾客态`, 'true', String(String(response.body.message).indexOf('顾客登录态') >= 0 || String(response.body.message).indexOf('请先登录') >= 0));
  }
  const anonymousOrder = await req('POST', '/client/orders', { dineType: 'dine_in', items: [{ dishId: 1, quantity: 1 }] });
  check('匿名下单 401', 401, anonymousOrder.status);

  const loginNoStore = await req('POST', '/client/auth/login', { code: 'FAKE_CODE' });
  check('登录缺门店编号被拦', 400, loginNoStore.status);
  const login = await req('POST', '/client/auth/login', { code: 'FAKE_CODE_123', merchantCode: 'M10001' });
  check('登录不使用任何模拟分支（不会 500）', 'true', String(login.status !== 500));
  check('登录失败有业务码', 'true', String(login.body.code !== 0));
  if (login.body.code === 400 && String(login.body.message).indexOf('小程序') >= 0) {
    ok('未配置凭据时给出「去平台后台配置」的可执行提示');
  } else {
    ok(`凭据已配置，登录走到了微信侧（返回：${String(login.body.message).slice(0, 40)}）`);
  }

  console.log('== 6. 平台端小程序配置 ==');
  const adminLogin = await req('POST', '/auth/platform/login', { username: 'admin', password: 'Admin@123456' });
  check('平台登录成功', 0, codeOf(adminLogin));
  const adminToken = adminLogin.body.data.accessToken;
  const config = await req('GET', '/platform/mini-program-config', null, adminToken);
  check('管理员可读小程序配置', 0, codeOf(config));
  check('配置视图带 configured 布尔', 'boolean', typeof config.body.data.configured);
  check('响应里不存在 AppSecret 字段', 'false', String('appSecret' in config.body.data));
  check('密钥只以掩码下发', 'true', String(typeof config.body.data.secretMasked === 'string'));
  check('掩码不可能是明文', 'true', String(config.body.data.secretMasked === '' || config.body.data.secretMasked === '********'));
  check('带密钥指纹用于人工核对', 'true', String(config.body.data.secretFingerprint === null || /^[0-9a-f]{8}$/.test(config.body.data.secretFingerprint)));
  check('缺项提示可读', 'true', String(Array.isArray(config.body.data.missingFields)));
  check('配置里不含加密主密钥', 'false', String(config.text.indexOf('CONFIG_ENCRYPTION_KEY') >= 0));

  const operatorLogin = await req('POST', '/auth/platform/login', { username: 'operator', password: 'Operator@123456' });
  check('运营账号可登录', 0, codeOf(operatorLogin));
  const operatorRead = await req('GET', '/platform/mini-program-config', null, operatorLogin.body.data.accessToken);
  check('运营无权读小程序配置', 403, operatorRead.body.code);
  const operatorWrite = await req('PUT', '/platform/mini-program-config', { appId: 'wx0000000000000000' }, operatorLogin.body.data.accessToken);
  check('运营无权写小程序配置', 403, operatorWrite.body.code);
  const badWrite = await req('PUT', '/platform/mini-program-config', {}, adminToken);
  check('空 body 被 DTO 拦住（appId 必填）', 400, badWrite.status);

  const channels = await req('GET', '/client/payments/channels?merchantCode=M10001', null, bossToken);
  check('渠道接口不被匿名放行', 403, channels.body.code);

  console.log('\n----------------------------------------');
  console.log(`顾客端冒烟结果：通过 ${pass} 项，失败 ${fail} 项`);
  if (fail > 0) {
    console.log('失败清单：\n  - ' + fails.join('\n  - '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('冒烟脚本异常:', error.message);
  process.exit(1);
});
