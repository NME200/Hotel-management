/** 顾客令牌里的角色名。后台的角色权限表里没有它，因此顾客令牌拿不到任何后台权限点。 */
export const CLIENT_ROLE = 'member';

/**
 * 小程序码 scene 里携带门店参数的写法：`m=M10001`。
 *
 * 商家侧生成太阳码时把商户编号塞进 scene，顾客扫码即定店；
 * scene 缺失或解析不出来时前端落到「选择门店」列表页，而不是默认进某家店。
 */
export const SCENE_MERCHANT_KEY = 'm';

/** 解析小程序码 scene：兼容 `m=M10001`、`M10001`、以及被转义过一次的 `%3D`。 */
export function parseSceneMerchantCode(scene?: string | null): string | null {
  const raw = scene?.trim();
  if (!raw) {
    return null;
  }
  const decoded = safeDecode(raw);
  const pairs = decoded.split(/[&;]/);
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (value && (key ?? '').trim().toLowerCase() === SCENE_MERCHANT_KEY) {
      return value.trim();
    }
  }
  // 整串就是商户编号的简写形式
  return /^[A-Za-z0-9_-]{3,32}$/.test(decoded) ? decoded : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* ============================ 算价常量 ============================ */

/** 打包费：非堂食按「行」收，一行一份餐盒，与商家端历史订单口径一致。 */
export const PACKING_CENTS_PER_LINE = 100;

/** 外送配送费：门店级配送费配置还没做，先按固定值收，字段口径与订单落库一致。 */
export const DELIVERY_CENTS = 500;

/** 预计出餐时长（分钟），跟踪页的倒计时由它推导。 */
export const ESTIMATE_PREPARE_MINUTES = 15;

/** 一单最多几种菜品，防刷单也防前端把整店菜单一次性提交。 */
export const MAX_ORDER_LINES = 50;
