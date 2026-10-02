/**
 * 顾客小程序演示数据：券模板、会员持券、会员成长值、门店营业状态。
 *
 * 为什么不并进 run-seed.ts：券域是后补的两张表，已经跑过 db:seed 的环境
 * 只要再执行这一条脚本就能把「优惠券 / 会员中心 / 门店列表」三个页面灌满，
 * 不必重灌整库。后端此时可能在跑，所以每一步都先查后写、只统计跳过，
 * 重复执行不报错也不产生第二份数据。
 *
 * 只做 INSERT / SELECT：表结构归迁移管，脚本里不出现任何 DDL。
 *
 * 用法：node scripts/seed-client-demo.cjs   （开发环境专用）
 */
const { randomInt } = require('crypto');
const { connect } = require('./lib/db.cjs');

/** 等级阈值与 dict.ts 的 MEMBER_LEVEL_RULES 同一份数字；脚本是 .cjs，import 不了 TS，抄一份纯数据。 */
const LEVEL_RULES = [
  { level: 'normal', threshold: 0 },
  { level: 'silver', threshold: 2000 },
  { level: 'gold', threshold: 5000 },
  { level: 'vip', threshold: 12000 },
];

/** 假 openid 的前缀：唯一索引是 (merchant_id, openid)，一眼要和真实微信用户分清楚。 */
const OPENID_PREFIX = 'oSEEDdemo';

const pad = (value, length) => String(value).padStart(length, '0');

/** 券号：CP + 14 位时间数字 + 6 位随机，与 id.util 的 generateCouponNo 同形状（这里不 import TS）。 */
function buildCouponNo(date) {
  const stamp = `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`
    + `${pad(date.getHours(), 2)}${pad(date.getMinutes(), 2)}${pad(date.getSeconds(), 2)}`;
  return `CP${stamp}${pad(randomInt(0, 1000000), 6)}`;
}

/** 库里 datetime 是秒精度，直接把 JS Date 交给驱动会带上毫秒，统一转成 MySQL 认的文本。 */
function dt(value) {
  if (!value) {
    return null;
  }
  return `${value.getFullYear()}-${pad(value.getMonth() + 1, 2)}-${pad(value.getDate(), 2)} `
    + `${pad(value.getHours(), 2)}:${pad(value.getMinutes(), 2)}:${pad(value.getSeconds(), 2)}`;
}

function daysAgo(days, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function plusDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** 固定有效期：本月 1 号起到第 3 个自然月月末，覆盖 10/11/12 三个月。 */
const NOW = new Date();
const FIXED_FROM = new Date(NOW.getFullYear(), NOW.getMonth(), 1, 0, 0, 0);
const FIXED_TO = new Date(NOW.getFullYear(), NOW.getMonth() + 3, 0, 23, 59, 59);

const TEMPLATE_COLUMNS = [
  'merchant_id', 'name', 'type', 'amount_cents', 'discount_ratio', 'max_discount_cents',
  'threshold_cents', 'validity_type', 'valid_from', 'valid_to', 'valid_days', 'total_count',
  'issued_count', 'per_member_limit', 'claimable', 'redeem_code', 'scope_type', 'scope_ids',
  'description', 'status', 'sort',
];

const COUPON_COLUMNS = [
  'merchant_id', 'coupon_no', 'template_id', 'member_id', 'name', 'type', 'amount_cents',
  'discount_ratio', 'max_discount_cents', 'threshold_cents', 'scope_type', 'scope_ids',
  'description', 'valid_from', 'valid_to', 'status', 'source', 'order_id', 'used_at',
];

/**
 * 每个商户一份计划。金额全部是「分」的整数，列名 snake_case，
 * 租户键 merchant_id 由运行时按 code 查出来的真实 id 填，不写死数字。
 */
const MERCHANT_PLANS = [
  {
    code: 'M10001',
    /** 成长值按 id 升序落到前 4 位会员身上：绿卡 / 银卡 / 金卡 / 绿卡，level 由阈值反推。 */
    growth: [1280, 2400, 5600, 600],
    ensureStoreOpen: true,
    templates: [
      {
        key: 'full39',
        name: '满39减8元券',
        type: 'reduction',
        amount_cents: 800,
        discount_ratio: null,
        max_discount_cents: null,
        threshold_cents: 3900,
        validity_type: 'fixed',
        valid_days: null,
        total_count: -1,
        per_member_limit: 2,
        claimable: 1,
        redeem_code: null,
        scope_type: 'all',
        scope_categories: 0,
        description: '全场通用，午市晚市都能用',
        status: 'enabled',
        sort: 1,
      },
      {
        // 已下架模板 + 它发出去的历史券仍可核销，正好演示「改模板不追溯影响已发出的券」
        key: 'full99',
        name: '满99减25元券',
        type: 'reduction',
        amount_cents: 2500,
        discount_ratio: null,
        max_discount_cents: null,
        threshold_cents: 9900,
        validity_type: 'fixed',
        valid_days: null,
        total_count: -1,
        per_member_limit: 1,
        claimable: 1,
        redeem_code: null,
        scope_type: 'all',
        scope_categories: 0,
        description: '下架演示：领券中心不再展示，已发到手的券照常可用',
        status: 'disabled',
        sort: 2,
      },
      {
        key: 'discount88',
        name: '8.8折会员折扣券',
        type: 'discount',
        amount_cents: 0,
        discount_ratio: 0.88,
        max_discount_cents: 2000,
        threshold_cents: 6000,
        validity_type: 'fixed',
        valid_days: null,
        total_count: -1,
        per_member_limit: 2,
        claimable: 1,
        redeem_code: null,
        scope_type: 'all',
        scope_categories: 0,
        description: '满 60 元可用，最高优惠 20 元',
        status: 'enabled',
        sort: 3,
      },
      {
        key: 'nocash5',
        name: '5元无门槛代金券',
        type: 'reduction',
        amount_cents: 500,
        discount_ratio: null,
        max_discount_cents: null,
        threshold_cents: 0,
        validity_type: 'relative',
        valid_days: 30,
        total_count: 100,
        per_member_limit: 2,
        claimable: 1,
        redeem_code: null,
        scope_type: 'all',
        scope_categories: 0,
        description: '无门槛，领取后 30 天内有效',
        status: 'enabled',
        sort: 4,
      },
      {
        key: 'catSign',
        name: '招牌菜满45减12券',
        type: 'reduction',
        amount_cents: 1200,
        discount_ratio: null,
        max_discount_cents: null,
        threshold_cents: 4500,
        validity_type: 'fixed',
        valid_days: null,
        total_count: -1,
        per_member_limit: 1,
        claimable: 1,
        redeem_code: null,
        scope_type: 'category',
        scope_categories: 2,
        description: '限招牌推荐、经典川菜两个分类',
        status: 'enabled',
        sort: 5,
      },
      {
        key: 'redeem',
        name: 'NEW2026 新客券',
        type: 'reduction',
        amount_cents: 2000,
        discount_ratio: null,
        max_discount_cents: null,
        threshold_cents: 3000,
        validity_type: 'fixed',
        valid_days: null,
        total_count: -1,
        per_member_limit: 1,
        // 不进领券中心，只能从兑换码入口换
        claimable: 0,
        redeem_code: 'NEW2026',
        scope_type: 'all',
        scope_categories: 0,
        description: '兑换码 NEW2026 专享',
        status: 'enabled',
        sort: 6,
      },
    ],
    /** 覆盖未使用/已使用/已过期三个标签页；(会员, 模板, 状态) 三元组唯一，是重复执行的判重键。 */
    coupons: [
      { tpl: 'full39', member: 0, status: 'unused', source: 'claim' },
      { tpl: 'discount88', member: 0, status: 'unused', source: 'claim' },
      { tpl: 'full99', member: 0, status: 'used', source: 'claim' },
      { tpl: 'catSign', member: 0, status: 'expired', source: 'merchant_send' },
      { tpl: 'full39', member: 1, status: 'unused', source: 'claim' },
      { tpl: 'nocash5', member: 1, status: 'unused', source: 'claim' },
      { tpl: 'catSign', member: 1, status: 'used', source: 'claim' },
      { tpl: 'full99', member: 1, status: 'expired', source: 'merchant_send' },
      { tpl: 'discount88', member: 2, status: 'unused', source: 'claim' },
      { tpl: 'nocash5', member: 2, status: 'unused', source: 'claim' },
      { tpl: 'redeem', member: 2, status: 'used', source: 'redeem_code' },
      { tpl: 'full39', member: 2, status: 'expired', source: 'claim' },
      { tpl: 'full39', member: 3, status: 'unused', source: 'merchant_send' },
      { tpl: 'nocash5', member: 3, status: 'unused', source: 'claim' },
      { tpl: 'catSign', member: 3, status: 'used', source: 'claim' },
      { tpl: 'discount88', member: 3, status: 'expired', source: 'merchant_send' },
    ],
  },
  {
    // 只给一条模板 + 一张券，用来验证 M10001 的券绝不会串到隔壁商户
    code: 'M10002',
    growth: null,
    ensureStoreOpen: false,
    templates: [
      {
        key: 'm2full25',
        name: '满25减3元券',
        type: 'reduction',
        amount_cents: 300,
        discount_ratio: null,
        max_discount_cents: null,
        threshold_cents: 2500,
        validity_type: 'fixed',
        valid_days: null,
        total_count: -1,
        per_member_limit: 1,
        claimable: 1,
        redeem_code: null,
        scope_type: 'all',
        scope_categories: 0,
        description: '江南面馆专享，用于验证租户隔离',
        status: 'enabled',
        sort: 1,
      },
    ],
    coupons: [{ tpl: 'm2full25', member: 0, status: 'unused', source: 'claim' }],
  },
];

function levelByGrowth(growthValue) {
  let current = LEVEL_RULES[0];
  for (const rule of LEVEL_RULES) {
    if (growthValue >= rule.threshold) {
      current = rule;
    }
  }
  return current.level;
}

async function findMerchantId(db, code) {
  const [rows] = await db.execute('SELECT id FROM merchant WHERE code = ? LIMIT 1', [code]);
  return rows.length ? rows[0].id : null;
}

/**
 * 分类 ID 现查：限指定分类的券要写商户库里真实存在的分类，不能凭空造。
 * 只挑「有在售菜品」的分类，否则冒烟测试留下的空分类会被排到前面，
 * 券面写着「限招牌推荐」而 scope_ids 指的却是没人点得到的 ID，小程序上就是永远算不出优惠。
 */
async function findCategories(db, merchantId, limit) {
  if (limit <= 0) {
    return [];
  }
  const [rows] = await db.execute(
    "SELECT c.id, c.name FROM dish_category c WHERE c.merchant_id = ? AND c.status = 'enabled'"
      + " AND EXISTS (SELECT 1 FROM dish d WHERE d.category_id = c.id AND d.status = 'on_sale')"
      + ' ORDER BY c.sort ASC, c.id ASC LIMIT 10',
    [merchantId],
  );
  return rows.slice(0, limit);
}

/**
 * 灌券模板：按 (merchant_id, name) 判重。
 * 模板没有业务唯一键（redeem_code 可空），name 在计划里本身不重复，够用且重跑只加一行。
 */
async function seedTemplates(db, merchantId, templates, coupons, stats) {
  const byKey = {};
  for (const template of templates) {
    const [found] = await db.execute(
      'SELECT id FROM coupon_template WHERE merchant_id = ? AND name = ? LIMIT 1',
      [merchantId, template.name],
    );
    if (found.length) {
      byKey[template.key] = { id: found[0].id, name: template.name };
      stats.templateSkipped += 1;
      console.log(`  [模板] 已存在，跳过：${template.name}`);
      continue;
    }

    const categories = await findCategories(db, merchantId, template.scope_categories);
    if (template.scope_categories > 0 && categories.length === 0) {
      console.log(`  [模板] 警告：该商户没有带在售菜品的分类，${template.name} 的适用范围先留空`);
    }
    // issued_count 按本次计划要发的张数预置，领券中心的「剩 N 张」才不会和实际对不上
    const issuedCount = coupons.filter((row) => row.tpl === template.key).length;
    const values = [
      merchantId, template.name, template.type, template.amount_cents, template.discount_ratio,
      template.max_discount_cents, template.threshold_cents, template.validity_type,
      template.validity_type === 'fixed' ? dt(FIXED_FROM) : null,
      template.validity_type === 'fixed' ? dt(FIXED_TO) : null,
      template.valid_days, template.total_count, issuedCount, template.per_member_limit,
      template.claimable, template.redeem_code, template.scope_type,
      categories.length ? JSON.stringify(categories.map((row) => row.id)) : null,
      template.description, template.status, template.sort,
    ];
    await db.execute(
      `INSERT INTO coupon_template (${TEMPLATE_COLUMNS.join(', ')}) VALUES (${TEMPLATE_COLUMNS.map(() => '?').join(', ')})`,
      values,
    );
    const [inserted] = await db.execute(
      'SELECT id FROM coupon_template WHERE merchant_id = ? AND name = ? LIMIT 1',
      [merchantId, template.name],
    );
    byKey[template.key] = { id: inserted[0].id, name: template.name };
    stats.templateInserted += 1;
    console.log(
      `  [模板] 新增 #${byKey[template.key].id} ${template.name}`
        + `｜${faceText(template)}｜门槛 ${template.threshold_cents / 100} 元`
        + `｜${template.status}${template.claimable ? '' : '·不进领券中心'}`
        + `${template.redeem_code ? `｜兑换码 ${template.redeem_code}` : ''}`
        + `${categories.length ? `｜限分类 ${categories.map((row) => row.name).join('、')}` : ''}`,
    );
  }
  return byKey;
}

function faceText(template) {
  return template.type === 'discount'
    ? `${(template.discount_ratio * 10).toFixed(1)}折(封顶 ${template.max_discount_cents / 100} 元)`
    : `减 ${template.amount_cents / 100} 元`;
}

const STATUS_TEXT = { unused: '未使用', used: '已使用', expired: '已过期' };

/**
 * 灌会员持券：快照字段一律从库里的模板行读出来再写，和 service 的 snapshotOf 同一个口径。
 * 有效期按状态现编——已过期那批必须落在过去，模板的固定区间在未来。
 */
async function seedCoupons(db, merchantId, byKey, coupons, members, stats) {
  for (const plan of coupons) {
    const member = members[plan.member];
    const brief = byKey[plan.tpl];
    if (!member || !brief) {
      console.log(`  [会员券] 跳过：会员或模板缺失（${plan.tpl} / 第 ${plan.member + 1} 位会员）`);
      stats.couponSkipped += 1;
      continue;
    }
    const templateId = brief.id;

    const [exists] = await db.execute(
      'SELECT id FROM member_coupon WHERE merchant_id = ? AND member_id = ? AND template_id = ? AND status = ? LIMIT 1',
      [merchantId, member.id, templateId, plan.status],
    );
    if (exists.length) {
      stats.couponSkipped += 1;
      console.log(`  [会员券] 已存在，跳过：${member.nickname}｜${brief.name}｜${STATUS_TEXT[plan.status]}`);
      continue;
    }

    const [rows] = await db.execute(
      'SELECT name, type, amount_cents, discount_ratio, max_discount_cents, threshold_cents,'
        + ' validity_type, valid_from, valid_to, valid_days, scope_type, scope_ids, description'
        + ' FROM coupon_template WHERE merchant_id = ? AND id = ? LIMIT 1',
      [merchantId, templateId],
    );
    const template = rows[0];
    const window = windowOf(plan.status, template);
    const order = plan.status === 'used' ? await findOrderFor(db, merchantId, member.id) : null;

    const row = {
      merchant_id: merchantId,
      coupon_no: buildCouponNo(NOW),
      template_id: templateId,
      member_id: member.id,
      name: template.name,
      type: template.type,
      amount_cents: template.amount_cents,
      discount_ratio: template.discount_ratio,
      max_discount_cents: template.max_discount_cents,
      threshold_cents: template.threshold_cents,
      scope_type: template.scope_type,
      scope_ids: template.scope_ids,
      description: template.description,
      valid_from: dt(window.from),
      valid_to: dt(window.to),
      status: plan.status,
      source: plan.source,
      order_id: order ? order.id : null,
      used_at: order ? dt(clamp(order.created_at, window.from, window.to)) : null,
    };
    await insertCoupon(db, row);
    stats.couponInserted += 1;
    console.log(
      `  [会员券] 新增 ${row.coupon_no}｜${member.nickname}｜${template.name}`
        + `｜${STATUS_TEXT[plan.status]}｜${dt(window.from)} ~ ${dt(window.to)}`
        + `${order ? `｜核销订单 #${order.id}` : ''}`,
    );
  }
}

/**
 * 券的有效期区间：
 * unused 用模板本来的区间（相对型按 valid_days 倒推），必须左开右未来，才落进「未使用」标签页；
 * used 起点放早，保证那笔真实订单的下单时间落在区间里；
 * expired 整段落在过去，库里状态直接写 expired。
 */
function windowOf(status, template) {
  if (status === 'expired') {
    return { from: daysAgo(75), to: daysAgo(5) };
  }
  if (template.validity_type === 'relative') {
    const from = status === 'used' ? daysAgo(60) : daysAgo(3);
    return { from, to: plusDays(from, template.valid_days || 30) };
  }
  if (status === 'used') {
    return { from: daysAgo(60), to: template.valid_to };
  }
  return { from: template.valid_from, to: template.valid_to };
}

function clamp(date, from, to) {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (Number.isNaN(time)) {
    return from;
  }
  return new Date(Math.min(Math.max(time, from.getTime()), to.getTime()));
}

/** 核销要挂真实订单：优先该会员自己的，退一步用本店任意一单，都没有就留 NULL。 */
async function findOrderFor(db, merchantId, memberId) {
  const [own] = await db.execute(
    'SELECT id, created_at FROM order_info WHERE merchant_id = ? AND member_id = ? ORDER BY id DESC LIMIT 1',
    [merchantId, memberId],
  );
  if (own.length) {
    return own[0];
  }
  const [any] = await db.execute(
    'SELECT id, created_at FROM order_info WHERE merchant_id = ? ORDER BY id DESC LIMIT 1',
    [merchantId],
  );
  return any.length ? any[0] : null;
}

/** 券号里有 6 位随机，同一秒并发插入可能撞唯一索引；撞了就重新拼一个，不改数据形状。 */
async function insertCoupon(db, row) {
  const columns = COUPON_COLUMNS.join(', ');
  const holders = COUPON_COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO member_coupon (${columns}) VALUES (${holders})`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await db.execute(sql, COUPON_COLUMNS.map((column) => row[column]));
      return;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || !String(error.message).includes('coupon_no')) {
        throw error;
      }
      row.coupon_no = buildCouponNo(new Date());
    }
  }
  throw new Error('券号连续三次冲突，请重跑脚本');
}

/**
 * 会员成长值与 openid：只碰 openid IS NULL 的行——
 * 已经真实登录过的会员由微信侧建档，演示数据不去覆盖他的等级。
 */
async function seedMemberGrowth(db, merchantId, growthPlan, stats) {
  const [rows] = await db.execute(
    'SELECT id, nickname, openid, growth_value, level FROM member WHERE merchant_id = ? ORDER BY id ASC',
    [merchantId],
  );
  for (let index = 0; index < growthPlan.length; index += 1) {
    const member = rows[index];
    const growthValue = growthPlan[index];
    if (!member) {
      console.log(`  [会员] 跳过：第 ${index + 1} 位会员不存在，先跑 pnpm db:seed`);
      stats.memberSkipped += 1;
      continue;
    }
    if (member.openid) {
      stats.memberSkipped += 1;
      console.log(`  [会员] 已有 openid，跳过：${member.nickname}（成长值 ${member.growth_value}）`);
      continue;
    }
    const level = levelByGrowth(growthValue);
    const openid = `${OPENID_PREFIX}${pad(index + 1, 21)}`;
    const [result] = await db.execute(
      'UPDATE member SET growth_value = ?, level = ?, openid = ? WHERE id = ? AND merchant_id = ? AND openid IS NULL',
      [growthValue, level, openid, member.id, merchantId],
    );
    if (result.affectedRows) {
      stats.memberUpdated += 1;
      console.log(`  [会员] 更新 ${member.nickname}：成长值 ${growthValue} → ${level}｜openid ${openid}`);
    } else {
      stats.memberSkipped += 1;
    }
  }
}

/** 小程序休息中不能下单，演示门店必须是 open；本来就是 open 则不动。 */
async function ensureStoreOpen(db, merchantId, stats) {
  const [rows] = await db.execute('SELECT id, name, status FROM store WHERE merchant_id = ? LIMIT 1', [merchantId]);
  if (!rows.length) {
    console.log('  [门店] 跳过：该商户没有门店记录');
    stats.storeSkipped += 1;
    return;
  }
  if (rows[0].status === 'open') {
    stats.storeSkipped += 1;
    console.log(`  [门店] 已是营业状态，跳过：${rows[0].name}`);
    return;
  }
  await db.execute("UPDATE store SET status = 'open' WHERE id = ? AND merchant_id = ?", [rows[0].id, merchantId]);
  stats.storeUpdated += 1;
  console.log(`  [门店] 置为营业：${rows[0].name}（原 ${rows[0].status}）`);
}

(async () => {
  const db = await connect();
  const stats = {
    templateInserted: 0,
    templateSkipped: 0,
    couponInserted: 0,
    couponSkipped: 0,
    memberUpdated: 0,
    memberSkipped: 0,
    storeUpdated: 0,
    storeSkipped: 0,
  };

  try {
    for (const plan of MERCHANT_PLANS) {
      const merchantId = await findMerchantId(db, plan.code);
      if (!merchantId) {
        console.log(`找不到商户 ${plan.code}，先跑 pnpm db:seed`);
        process.exit(1);
      }
      console.log(`\n== ${plan.code}（merchant_id=${merchantId}）==`);

      const byKey = await seedTemplates(db, merchantId, plan.templates, plan.coupons, stats);

      const [members] = await db.execute(
        'SELECT id, nickname FROM member WHERE merchant_id = ? ORDER BY id ASC',
        [merchantId],
      );
      if (!members.length) {
        console.log('  [会员券] 跳过：该商户没有会员，先跑 pnpm db:seed');
        stats.couponSkipped += plan.coupons.length;
      } else {
        await seedCoupons(db, merchantId, byKey, plan.coupons, members, stats);
      }

      if (plan.growth) {
        await seedMemberGrowth(db, merchantId, plan.growth, stats);
      }
      if (plan.ensureStoreOpen) {
        await ensureStoreOpen(db, merchantId, stats);
      }
    }

    console.log(
      `\n演示数据完成：券模板 新增 ${stats.templateInserted} / 跳过 ${stats.templateSkipped} 条，`
        + `会员券 新增 ${stats.couponInserted} / 跳过 ${stats.couponSkipped} 张，`
        + `会员成长值与 openid 更新 ${stats.memberUpdated} / 跳过 ${stats.memberSkipped} 人，`
        + `门店营业状态 更新 ${stats.storeUpdated} / 跳过 ${stats.storeSkipped} 家。`
        + '登录演示账号见 README。',
    );
  } finally {
    await db.end();
  }
})().catch((error) => {
  console.error('脚本异常:', error.message);
  process.exit(1);
});
