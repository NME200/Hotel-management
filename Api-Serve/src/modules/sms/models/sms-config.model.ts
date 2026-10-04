import type { SmsDriver } from '../constants/sms-driver.constant';
import type { PrintSecretFieldView } from '../../print-provider/models/print-provider.model';

/** 当前生效的短信配置：数据库优先，缺字段回落 `.env`，再缺就用代码里的官方兜底值。 */
export interface EffectiveSmsConfig {
  driver: SmsDriver;
  /** 平台总开关：关掉时商户侧的发码请求直接被拒 */
  enabled: boolean;
  /** 阿里云 AccessKeyId / 腾讯云 SecretId 共用这一项 */
  accessKeyId: string;
  /** 阿里云 AccessKeySecret / 腾讯云 SecretKey 共用这一项（已解密） */
  accessKeySecret: string;
  /** 腾讯云短信应用 SdkAppId */
  sdkAppId: string;
  signName: string;
  /** 阿里云模板 CODE（SMS_xxx）/ 腾讯云模板 ID（纯数字） */
  templateCode: string;
  region: string;
  /** 云厂商网关地址；自定义通道下这就是网关本身的地址 */
  endpoint: string;
  /** 自定义通道：注入鉴权头的密钥（已解密） */
  customToken: string;
  /** 自定义通道：`头名: 头值模板`，头值里的 {token} 被 customToken 替换 */
  customAuthHeader: string;
  /** 自定义通道：请求体 JSON 模板，支持 {phone} {code} {signName} {templateCode} */
  customBodyTemplate: string;
  source: 'database' | 'env' | 'none';
  /** 还缺哪些必填字段（已按通道翻成中文） */
  missingFields: string[];
  configured: boolean;
  /**
   * 该通道在当前环境是否允许使用。
   * `log` 只把验证码写进日志，生产环境允许它等于把登录凭据抄送给整套日志采集系统。
   */
  allowed: boolean;
  disallowReason: string | null;
}

/** 一个通道的配置口径：界面按它决定显示哪些输入框、哪些必填、要几个密钥。 */
export interface SmsDriverMeta {
  driver: SmsDriver;
  label: string;
  /** 该通道界面上出现的字段名 */
  fields: string[];
  /** 该通道的必填字段名（决定表单校验规则） */
  requiredFields: string[];
  /** 字段中文名按厂商原文给，界面不再自己写一份，避免两边措辞漂移 */
  labels: Record<string, string>;
  /** 该通道的密钥字段（含掩码与指纹）：切换通道时界面直接按这个渲染，不必先保存 */
  secretFields: PrintSecretFieldView[];
  /** 留空时的兜底值，界面直接拿来当输入框占位符 */
  defaults: {
    region: string;
    endpoint: string;
    authHeader: string;
    bodyTemplate: string;
  };
}

/** GET /platform/sms-config 的下发形态。 */
export interface SmsConfigItem {
  enabled: boolean;
  configured: boolean;
  missingFields: string[];
  source: 'database' | 'env' | 'none';
  /** 生效通道（含 .env 回落） */
  driver: SmsDriver;
  /** 后台显式选过的通道；null 表示跟随 .env */
  driverOverride: SmsDriver | null;
  /** 当前部署环境是否允许选 log 通道 */
  logAllowed: boolean;
  /** 四个通道各自的口径与密钥状态，界面按当前选中的那个渲染 */
  drivers: SmsDriverMeta[];
  /** 明文可见的配置项 */
  accessKeyId: string | null;
  sdkAppId: string | null;
  signName: string | null;
  templateCode: string | null;
  region: string;
  endpoint: string;
  /** 数据库里显式填过的覆盖值；null 表示用的是 .env 或代码里的官方默认 */
  overrides: {
    region: string | null;
    endpoint: string | null;
    customAuthHeader: string | null;
    customBodyTemplate: string | null;
  };
  updatedAt: Date | null;
  updatedByName: string | null;
}
