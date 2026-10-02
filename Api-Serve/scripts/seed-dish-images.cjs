/**
 * 回填菜品图片路径。
 *
 * 为什么要单独一个脚本而不是改 demo-data.ts：
 * demo 商户已经建过就会被 `db:seed` 整体跳过（幂等策略是「按商户编号判存在」），
 * 只改种子数据文件不会更新已有库，反而让新库和老库长得不一样。
 * 这个脚本按「商户编号 + 菜名」定位行并覆写 image，跑多少次结果都一样。
 *
 * 图片是本地资源（UI-uniapp/static/dish/ 下由设计稿生成的实拍图），
 * 存的是小程序侧可直接用的绝对路径，小程序里 <image :src> 直接消费。
 */
const { connect } = require('./lib/db.cjs');

/** 商户编号 -> [{ 菜名, 图片文件 }]，顺序与出图时的分类顺序一致 */
const IMAGE_BY_MERCHANT = {
  M10001: [
    { name: '水煮牛肉', file: 'dish-01.jpg' },
    { name: '宫保鸡丁', file: 'dish-02.jpg' },
    { name: '麻婆豆腐', file: 'dish-03.jpg' },
    { name: '回锅肉', file: 'dish-04.jpg' },
    { name: '鱼香肉丝', file: 'dish-05.jpg' },
    { name: '口水鸡', file: 'dish-06.jpg' },
    { name: '拍黄瓜', file: 'dish-07.jpg' },
    { name: '担担面', file: 'dish-08.jpg' },
    { name: '番茄蛋花汤', file: 'dish-09.jpg' },
    { name: '酸梅汤', file: 'dish-10.jpg' },
  ],
};

const IMAGE_PATH_PREFIX = '/static/dish/';

async function main() {
  const db = await connect();
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  try {
    for (const [code, items] of Object.entries(IMAGE_BY_MERCHANT)) {
      const [merchants] = await db.query('SELECT id FROM merchant WHERE code = ?', [code]);
      if (merchants.length === 0) {
        console.log(`商户 ${code} 不存在，跳过`);
        continue;
      }
      const merchantId = merchants[0].id;
      console.log(`== ${code}（merchant_id=${merchantId}）==`);

      for (const item of items) {
        const image = IMAGE_PATH_PREFIX + item.file;
        const [result] = await db.query(
          'UPDATE dish SET image = ? WHERE merchant_id = ? AND name = ? AND image IS NULL',
          [image, merchantId, item.name],
        );
        if (result.affectedRows > 0) {
          updated += 1;
          console.log(`  [图片] ${item.name} → ${image}`);
          continue;
        }
        // affectedRows = 0 有两种情况：路径已经对（跳过），或压根没这道菜（要报出来）
        const [rows] = await db.query(
          'SELECT id, image FROM dish WHERE merchant_id = ? AND name = ? LIMIT 1',
          [merchantId, item.name],
        );
        if (rows.length === 0) {
          missing += 1;
          console.log(`  [缺失] 没有这道菜：${item.name}`);
        } else {
          skipped += 1;
        }
      }
    }
  } finally {
    await db.end();
  }

  console.log(
    `菜品图片回填完成：更新 ${updated} 个，已是最新 ${skipped} 个，未匹配到菜品 ${missing} 个。`,
  );
  if (missing > 0) {
    console.log('未匹配通常是菜名与出图清单不一致，请核对 demo-data.ts 与上方 IMAGE_BY_MERCHANT。');
  }
}

main().catch((error) => {
  console.error('脚本异常:', error.message);
  process.exit(1);
});
