/**
 * 云打印机厂商机器码。
 *
 * 与 `printer.provider` 落库值同源：商家端表单的下拉、后端校验、
 * 平台端配置页的卡片，三处引的都是这一份，避免出现「表单能选但后端不认」。
 */
export const PrintProvider = {
  Feie: 'feie',
  Yilianyun: 'yilianyun',
} as const;
export type PrintProvider = (typeof PrintProvider)[keyof typeof PrintProvider];

export const PRINT_PROVIDER_LABELS: Record<PrintProvider, string> = {
  [PrintProvider.Feie]: '飞鹅云打印机',
  [PrintProvider.Yilianyun]: '易联云打印机',
};

/**
 * 各厂商必须齐备的凭据字段，决定「配置就绪」与「还缺什么」。
 *
 * 只列凭据，不列网关地址：地址有官方兜底，缺它不算没配好。
 */
export const PRINT_PROVIDER_REQUIRED_FIELDS: Record<PrintProvider, string[]> = {
  [PrintProvider.Feie]: ['uid', 'apiKey'],
  [PrintProvider.Yilianyun]: ['clientId', 'clientSecret'],
};

/** 各厂商需要单独管理的密钥字段（界面逐个显示掩码与指纹）。 */
export const PRINT_PROVIDER_SECRET_FIELDS: Record<
  PrintProvider,
  ('apiKey' | 'clientSecret')[]
> = {
  [PrintProvider.Feie]: ['apiKey'],
  [PrintProvider.Yilianyun]: ['clientSecret'],
};

export const PRINT_SECRET_FIELD_LABELS: Record<string, string> = {
  // 飞鹅的账号叫 user，是后台登录名（一般是邮箱），不是 UUID 也不是数字 ID ——
  // 措辞按厂商原文写，否则平台运营会拿着"uid"去飞鹅后台找一个不存在的东西
  uid: '飞鹅账号 user（后台登录名）',
  clientId: '应用 client_id',
  apiKey: '飞鹅 UKEY',
  clientSecret: '应用 client_secret',
};

/** 单次推送网关的等待上限；云打印机排队出纸，等太久不如让商家看到失败。 */
export const PRINT_GATEWAY_TIMEOUT_MS = 8000;
