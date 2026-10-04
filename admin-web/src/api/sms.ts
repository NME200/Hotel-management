import { http } from './request'
import type { SmsConfigUpdateInput, SmsConfigView, SmsTestResult } from './types/sms'

/** GET /platform/sms-config 读取短信配置（四个通道的口径与密钥状态一起下发，密钥只有掩码与指纹） */
export function fetchSmsConfig(): Promise<SmsConfigView> {
  return http.get<SmsConfigView>('/platform/sms-config')
}

/**
 * PUT /platform/sms-config 保存配置。
 * input.secrets 里某字段不下发或等于掩码表示不改动，空串表示清空；
 * 要提交哪几个密钥字段由当前通道的 `drivers[].secretFields` 决定。
 */
export function updateSmsConfig(input: SmsConfigUpdateInput): Promise<SmsConfigView> {
  return http.put<SmsConfigView>('/platform/sms-config', input)
}

/**
 * POST /platform/sms-config/test 自检。
 * 读的是已保存配置而不是页面草稿；云厂商查签名/模板审核状态，不消耗发送额度，
 * 自定义通道没有这种免费接口，只校验配置形状。
 */
export function testSmsConfig(): Promise<SmsTestResult> {
  return http.post<SmsTestResult>('/platform/sms-config/test')
}
