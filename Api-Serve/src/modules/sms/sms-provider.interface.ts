import type { SmsDriver } from './constants/sms-driver.constant';
import type { EffectiveSmsConfig } from './models/sms-config.model';

/**
 * 短信通道端口。与 `CloudPrintProvider`、`PaymentProvider` 同一套形态：
 * 厂商差异收在实现里，业务侧只认这个接口。
 *
 * 配置由调用方（`SmsService` 从 `SmsConfigService` 拿生效值）传进来，
 * 实现自己不去读 `.env` —— 否则后台改了配置要等进程重启才生效。
 */
export interface SmsProvider {
  readonly driver: SmsDriver;

  /** 通道可读名，用于「为什么发不出去」的提示 */
  readonly label: string;

  /** 凭据是否齐备。缺凭据时不发网络请求，直接让上层给出明白话 */
  isReady(config: EffectiveSmsConfig): boolean;

  /**
   * 发送验证码。实现只需保证「抛异常 = 没发出去」，
   * 计数回滚由 `SmsService` 统一做，不让每家厂商各写一份。
   */
  send(config: EffectiveSmsConfig, phone: string, code: string): Promise<void>;

  /**
   * 自检：尽量在**不消耗发送额度**的前提下回答「凭据与模板到底行不行」。
   * 云厂商走免费的查询类接口；自定义网关没有这种接口，就只验配置形状并说明还差实发一步。
   * 真发一条测试短信要花钱也要额度，运营在后台点一下按钮就烧掉一条是不合适的。
   */
  probe(config: EffectiveSmsConfig): Promise<{ ok: boolean; message: string }>;
}
