/**
 * 运营位活动 + 限时活动演示数据：全部走商家端接口写入，不直连库。
 *
 * 为什么不并进 run-seed.ts：这两张表是后补的，已经跑过 db:seed 的环境
 * 只要再执行这一条脚本就能把首页轮播、「我的」页、会员中心、菜品活动价灌满；
 * 而且 merchant_id 由登录态决定，脚本里不出现任何商户 ID，也就种不错店。
 *
 * 限时活动的菜品 ID 是查出来的而不是写死的：换库、重灌种子都不会让脚本失效。
 *
 * 每一步先查后写，重复执行只统计跳过。
 *
 * 用法：node scripts/seed-activity-demo.cjs  （前置：后端已启动、已 pnpm db:seed）
 */
const http = require('http');

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

const pad = (value) => String(value).padStart(2, '0');

/** 本地时间文本：后端按墙上时钟解析，这里绝不用 toISOString（那是 UTC，会差 8 小时）。 */
function localDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function plusDays(days, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return localDateTime(date);
}

/** M10001 川味小馆：两张即时生效的首页卡 + 会员中心活动区，「我的」页留给系统会员日卡。 */
const ACTIVITIES = {
  M10001: [
    {
      name: '全场 6 折限时特惠',
      slot: 'home',
      title: '全场 6 折 限时开抢',
      subTitle: '今日有效 · 点击直接进菜单',
      icon: 'bolt',
      action: 'menu',
      sort: 0,
    },
    {
      name: '周末到店满减',
      slot: 'home',
      title: '周末到店 满 100 减 20',
      subTitle: '堂食自取同享 · 门店列表可切换',
      icon: 'ticket',
      action: 'stores',
      sort: 10,
    },
    {
      name: '双 11 预热',
      slot: 'home',
      title: '双 11 预热 明早十点开始',
      subTitle: '未到生效时间，顾客端暂时看不到',
      icon: 'calendar',
      action: 'coupons',
      startsAt: plusDays(1, 10),
      endsAt: plusDays(9, 22),
      sort: 20,
    },
    {
      name: '成长值冲刺',
      slot: 'member',
      title: '攒成长值 升会员等级',
      subTitle: '会员日当天完成订单，成长值翻倍',
      icon: 'points',
      action: 'member',
      sort: 10,
    },
    {
      name: '企业团餐',
      slot: 'member',
      title: '企业团餐 满 300 元免配送费',
      subTitle: '搜索「团餐」查看规则',
      icon: 'order',
      action: 'search',
      sort: 20,
    },
  ],
  M10002: [
    {
      name: '招牌面新品',
      slot: 'home',
      title: '招牌牛肉面 新品上架',
      subTitle: '到店试吃 · 外卖同价',
      icon: 'bolt',
      action: 'search',
      sort: 0,
    },
  ],
};

/**
 * 限时活动演示数据。
 *
 * 菜品 ID 现场查：先按名字找，找不到就退到第一个无规格的在售菜，
 * 这样重灌种子或换库都不会让脚本写进一个不存在的菜品。
 */
const PROMOTIONS = [
  {
    merchantCode: 'M10001',
    name: '回锅肉限时特价',
    badge: '特价',
    type: 'price',
    dishName: '回锅肉',
    /** 立减 7 元；低于成本价的风险由商家自己承担，脚本只保证不写成负数 */
    minus: 7,
    scopeType: 'dish',
  },
  {
    merchantCode: 'M10001',
    name: '凉菜午市 8 折',
    badge: '8折',
    type: 'discount',
    discount: 0.8,
    dishName: '口水鸡',
    scopeType: 'category',
  },
];

async function loginOf(merchantCode) {
  const result = await req('POST', '/auth/merchant/login', {
    merchantCode,
    username: 'boss',
    password: 'Boss@123456',
  });
  if (!result.json || !result.json.data) {
    throw new Error(`${merchantCode} 商家登录失败：${result.raw || JSON.stringify(result.json)}`);
  }
  return result.json.data.accessToken;
}

/** 名称 → ID：既用于「已存在就跳过」，也用于把已存在的活动 ID 拿来关联卡片。 */
async function existingByName(token, path) {
  // pageSize 上限是 100（PageQueryDto 的 @Max），给大了会被 400 挡掉，去重就失效了
  const list = await req('GET', `${path}?page=1&pageSize=100`, null, token);
  const rows = list.json && list.json.data ? list.json.data.list : [];
  return new Map(rows.map((item) => [item.name, item.id]));
}

async function dishesOf(token) {
  const list = await req('GET', '/merchant/dishes?page=1&pageSize=100', null, token);
  return list.json && list.json.data ? list.json.data.list : [];
}

/** 找一个能参与活动的菜：优先按名字，其次挑第一个没有规格差价的在售菜。 */
function pickDish(dishes, name) {
  const onSale = dishes.filter((item) => item.status === 'on_sale');
  const named = onSale.find((item) => item.name === name);
  if (named) {
    return named;
  }
  return onSale.find((item) => Number(item.price) > 8) || onSale[0] || null;
}

(async () => {
  let inserted = 0;
  let skipped = 0;
  const tokens = new Map();
  for (const merchantCode of Object.keys(ACTIVITIES)) {
    tokens.set(merchantCode, await loginOf(merchantCode));
  }

  for (const [merchantCode, rows] of Object.entries(ACTIVITIES)) {
    const token = tokens.get(merchantCode);
    const names = await existingByName(token, '/merchant/activities');
    for (const row of rows) {
      if (names.has(row.name)) {
        skipped += 1;
        console.log(`  跳过运营位 ${merchantCode} / ${row.name}`);
        continue;
      }
      const created = await req('POST', '/merchant/activities', row, token);
      if (!created.json || created.json.code !== 0) {
        throw new Error(
          `运营位 ${merchantCode} / ${row.name} 写入失败：${created.raw || JSON.stringify(created.json)}`,
        );
      }
      inserted += 1;
      console.log(`  新增运营位 ${merchantCode} / ${row.name}（${row.slot}）`);
    }
  }

  let promoInserted = 0;
  let promoSkipped = 0;
  const firstPromotionIds = new Map();
  for (const spec of PROMOTIONS) {
    const token = tokens.get(spec.merchantCode);
    const names = await existingByName(token, '/merchant/promotions');
    if (names.has(spec.name)) {
      promoSkipped += 1;
      console.log(`  跳过限时活动 ${spec.merchantCode} / ${spec.name}`);
      if (!firstPromotionIds.has(spec.merchantCode)) {
        firstPromotionIds.set(spec.merchantCode, names.get(spec.name));
      }
      continue;
    }
    const dishes = await dishesOf(token);
    const dish = pickDish(dishes, spec.dishName);
    if (!dish) {
      console.log(`  跳过限时活动 ${spec.name}：该门店没有可参与的在售菜品`);
      promoSkipped += 1;
      continue;
    }
    const body = {
      name: spec.name,
      badge: spec.badge,
      type: spec.type,
      scopeType: spec.scopeType,
      scopeIds: spec.scopeType === 'dish' ? [dish.id] : [dish.categoryId],
    };
    if (spec.type === 'price') {
      body.price = Number(Math.max(Number(dish.price) - spec.minus, 1).toFixed(2));
    } else {
      body.discount = spec.discount;
    }
    const created = await req('POST', '/merchant/promotions', body, token);
    if (!created.json || created.json.code !== 0) {
      throw new Error(
        `限时活动 ${spec.name} 写入失败：${created.raw || JSON.stringify(created.json)}`,
      );
    }
    promoInserted += 1;
    if (!firstPromotionIds.has(spec.merchantCode)) {
      firstPromotionIds.set(spec.merchantCode, created.json.data.id);
    }
    console.log(`  新增限时活动 ${spec.merchantCode} / ${spec.name}（${dish.name}）`);
  }

  // 让首页有一张卡真的指向限时活动：点进去只看参与活动的菜，这条链路才看得见
  for (const [merchantCode, promotionId] of firstPromotionIds) {
    const token = tokens.get(merchantCode);
    const names = await existingByName(token, '/merchant/activities');
    const cardName = '限时活动入口';
    if (names.has(cardName)) {
      console.log(`  跳过运营位 ${merchantCode} / ${cardName}`);
      continue;
    }
    const created = await req('POST', '/merchant/activities', {
      name: cardName,
      slot: 'home',
      title: '今日限时活动 点进来看参与的菜',
      subTitle: '活动价与会员价取低，优惠券仍可叠加',
      icon: 'price',
      action: 'promotion',
      promotionId,
      sort: 5,
    }, token);
    if (!created.json || created.json.code !== 0) {
      throw new Error(`运营位 ${cardName} 写入失败：${created.raw || JSON.stringify(created.json)}`);
    }
    inserted += 1;
    console.log(`  新增运营位 ${merchantCode} / ${cardName}（关联活动 ${promotionId}）`);
  }

  console.log(
    `\n运营位完成：新增 ${inserted} / 跳过 ${skipped} 条；`
      + `限时活动完成：新增 ${promoInserted} / 跳过 ${promoSkipped} 条。登录演示账号见 README。`,
  );
})().catch((error) => {
  console.error('脚本异常:', error.message);
  process.exit(1);
});
