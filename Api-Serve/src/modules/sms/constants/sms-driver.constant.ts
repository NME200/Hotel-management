/**
 * 短信通道机器码与各通道的配置口径。
 *
 * 与 `print-provider.constant.ts` 同一形态：通道的标签、必填项、密钥项、官方兜底值
 * 只在这里写一份，后端校验、平台端接口下发、admin-web 表单渲染三处共用，
 * 避免出现「界面能选但后端不认」或「界面提示缺 A、后端提示缺 B」。
 */
export const SmsDriver = {
  Log: 'log',
  Aliyun: 'aliyun',
  Tencent: 'tencent',
  Custom: 'custom',
} as const;
export type SmsDriver = (typeof SmsDriver)[keyof typeof SmsDriver];

export const SMS_DRIVERS = Object.values(SmsDriver) as SmsDriver[];

/**
 * 可配置的字段名。`accessKeyId` / `accessKeySecret` 是**语义名**而不是厂商名：
 * 阿里云叫 AccessKey ID/Secret，腾讯云叫 SecretId/SecretKey，是同一对凭据，
 * 按厂商另开列只会让表里长出四份几乎一样的字段。
 */
export const SmsConfigField = {
  AccessKeyId: 'accessKeyId',
  AccessKeySecret: 'accessKeySecret',
  SdkAppId: 'sdkAppId',
  SignName: 'signName',
  TemplateCode: 'templateCode',
  Region: 'region',
  Endpoint: 'endpoint',
  CustomToken: 'customToken',
  CustomAuthHeader: 'customAuthHeader',
  CustomBodyTemplate: 'customBodyTemplate',
} as const;
export type SmsConfigField = (typeof SmsConfigField)[keyof typeof SmsConfigField];

export const SMS_DRIVER_LABELS: Record<SmsDriver, string> = {
  [SmsDriver.Log]: '日志通道（不真发短信）',
  [SmsDriver.Aliyun]: '阿里云短信',
  [SmsDriver.Tencent]: '腾讯云短信',
  [SmsDriver.Custom]: '自定义短信网关',
};

/**
 * 各通道必须齐备才发得出验证码。
 *
 * 不列 `region` / `endpoint`：这两项有代码级官方兜底，缺它不算没配好。
 * 自定义通道也不列 `customToken`：内网自建网关常常没有鉴权，硬要一项会把人挡在门外。
 */
export const SMS_DRIVER_REQUIRED_FIELDS: Record<SmsDriver, SmsConfigField[]> = {
  [SmsDriver.Log]: [],
  [SmsDriver.Aliyun]: ['accessKeyId', 'accessKeySecret', 'signName', 'templateCode'],
  [SmsDriver.Tencent]: [
    'accessKeyId',
    'accessKeySecret',
    'sdkAppId',
    'signName',
    'templateCode',
  ],
  [SmsDriver.Custom]: ['endpoint', 'customBodyTemplate'],
};

/** 各通道界面上显示的字段（含选填），决定 admin-web 渲染哪些输入框。 */
export const SMS_DRIVER_FIELDS: Record<SmsDriver, SmsConfigField[]> = {
  [SmsDriver.Log]: [],
  [SmsDriver.Aliyun]: [
    'accessKeyId',
    'accessKeySecret',
    'signName',
    'templateCode',
    'region',
    'endpoint',
  ],
  [SmsDriver.Tencent]: [
    'accessKeyId',
    'accessKeySecret',
    'sdkAppId',
    'signName',
    'templateCode',
    'region',
    'endpoint',
  ],
  [SmsDriver.Custom]: [
    'endpoint',
    'customBodyTemplate',
    'customAuthHeader',
    'customToken',
    'signName',
    'templateCode',
  ],
};
/** 需要加密入库的字段；其余配置项都是明文。 */
export type SmsSecretName = 'accessKeySecret' | 'customToken';

/** 各通道的密钥字段：密文入库、只回掩码 + 指纹。 */
export const SMS_DRIVER_SECRET_FIELDS: Record<SmsDriver, SmsSecretName[]> = {
  [SmsDriver.Log]: [],
  [SmsDriver.Aliyun]: ['accessKeySecret'],
  [SmsDriver.Tencent]: ['accessKeySecret'],
  [SmsDriver.Custom]: ['customToken'],
};

/**
 * 字段中文名按通道给，理由与飞鹅那条一样：措辞要对上厂商控制台原文，
 * 否则运营会拿着「AccessKey ID」去腾讯云密钥管理页找一个不存在的东西。
 */
const SMS_FIELD_LABELS_BY_DRIVER: Record<SmsDriver, Partial<Record<SmsConfigField, string>>> = {
  [SmsDriver.Log]: {},
  [SmsDriver.Aliyun]: {
    accessKeyId: 'AccessKey ID',
    accessKeySecret: 'AccessKey Secret',
    templateCode: '验证码模板 CODE',
    endpoint: '网关地址覆盖',
  },
  [SmsDriver.Tencent]: {
    accessKeyId: 'SecretId（云 API 密钥 ID）',
    accessKeySecret: 'SecretKey（云 API 密钥）',
    sdkAppId: '短信应用 SdkAppId',
    templateCode: '短信模板 ID',
    endpoint: '网关地址覆盖',
  },
  [SmsDriver.Custom]: {
    endpoint: '网关地址',
    customToken: '网关密钥',
    customAuthHeader: '鉴权头',
    customBodyTemplate: '请求体模板',
    signName: '短信签名（可作为 {signName} 占位符）',
    templateCode: '模板号（可作为 {templateCode} 占位符）',
  },
};

const SMS_FIELD_LABELS_BASE: Partial<Record<SmsConfigField, string>> = {
  signName: '短信签名',
  templateCode: '验证码模板 CODE',
  region: '地域',
  endpoint: '网关地址',
  accessKeyId: 'AccessKey ID',
  accessKeySecret: 'AccessKey Secret',
};

export function smsFieldLabel(driver: SmsDriver, field: string): string {
  return (
    SMS_FIELD_LABELS_BY_DRIVER[driver]?.[field as SmsConfigField] ??
    SMS_FIELD_LABELS_BASE[field as SmsConfigField] ??
    field
  );
}

/** 自定义通道：密钥默认放 Authorization 头并带 Bearer 前缀，这是最常见的形态。 */
export const SMS_CUSTOM_DEFAULT_AUTH_HEADER = 'Authorization: Bearer {token}';

/** 自定义通道默认请求体：变量名与我们下发给云厂商模板变量的口径一致。 */
export const SMS_CUSTOM_DEFAULT_BODY_TEMPLATE =
  '{"phone":"{phone}","code":"{code}","signName":"{signName}","templateCode":"{templateCode}"}';

/** 官方地址与默认地域写死在代码里：厂商换域名是代码要跟着改的事。 */
export const SMS_DRIVER_DEFAULTS: Record<
  SmsDriver,
  { region: string; endpoint: string; authHeader: string; bodyTemplate: string }
> = {
  [SmsDriver.Log]: { region: '', endpoint: '', authHeader: '', bodyTemplate: '' },
  [SmsDriver.Aliyun]: {
    region: 'cn-hangzhou',
    endpoint: 'https://dysmsapi.aliyuncs.com',
    authHeader: '',
    bodyTemplate: '',
  },
  [SmsDriver.Tencent]: {
    region: 'ap-guangzhou',
    endpoint: 'https://sms.tencentcloudapi.com',
    authHeader: '',
    bodyTemplate: '',
  },
  [SmsDriver.Custom]: {
    region: '',
    endpoint: '',
    authHeader: SMS_CUSTOM_DEFAULT_AUTH_HEADER,
    bodyTemplate: SMS_CUSTOM_DEFAULT_BODY_TEMPLATE,
  },
};

/** 自定义通道模板里必须出现的两个占位符（缺了网关就拿不到凭据）。 */
export const SMS_CUSTOM_REQUIRED_PLACEHOLDERS = ['{phone}', '{code}'] as const;

/** 自定义通道鉴权头格式：`头名: 头值模板`，头值里的 `{token}` 会被密钥替换。 */
export function parseCustomAuthHeader(value: string): { name: string; pattern: string } | null {
  const index = value.indexOf(':');
  if (index < 1) {
    return null;
  }
  const name = value.slice(0, index).trim();
  const pattern = value.slice(index + 1).trim();
  if (!name || !pattern) {
    return null;
  }
  return { name, pattern };
}

/**
 * 自定义通道请求体模板的形状校验，返回可直接给运营看的中文错误；通过返回 null。
 *
 * 保存时就校验而不是发送时才炸，理由是：验证码请求来自顾客端，
 * 模板写坏了顾客只会看到「短信服务暂时不可用」，排查成本全压在平台身上。
 */
export function validateCustomBodyTemplate(value: string): string | null {
  const template = value.trim();
  const missing = SMS_CUSTOM_REQUIRED_PLACEHOLDERS.filter((item) => !template.includes(item));
  if (missing.length) {
    return `请求体模板缺少占位符 ${missing.join(' 和 ')}：网关拿不到手机号或验证码，这条短信发不出去`;
  }
  try {
    const parsed: unknown = JSON.parse(template);
    if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
      return '请求体模板要是一个 JSON 对象，形如 {"phone":"{phone}","code":"{code}"}';
    }
  } catch {
    return '请求体模板不是合法 JSON：请照默认那份写，占位符要写在引号里（例如 "code":"{code}"）';
  }
  return null;
}

/** 自定义通道网关地址校验：只接受 http(s)，避免把密钥发去 file: 或内网扫描器。 */
export function validateCustomEndpoint(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return '网关地址不是一个合法 URL，请填写形如 https://sms.example.com/send 的地址';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return '网关地址只支持 http 或 https';
  }
  if (!url.hostname) {
    return '网关地址缺少域名或 IP';
  }
  return null;
}
