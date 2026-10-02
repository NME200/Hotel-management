import type { FormItemRule } from 'element-plus'

/** 手机号（11 位，1 开头） */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/

export const requiredRule = (message: string): FormItemRule => ({
  required: true,
  message,
  trigger: ['blur', 'change'],
})

export const phoneRule: FormItemRule = {
  pattern: PHONE_PATTERN,
  message: '手机号格式不正确',
  trigger: 'blur',
}

/** 联系电话：手机或带区号的座机 */
export const telephonePattern = /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/

export const telephoneRule: FormItemRule = {
  pattern: telephonePattern,
  message: '请填写正确的手机号或座机号',
  trigger: 'blur',
}

export const passwordRule: FormItemRule = {
  min: 6,
  max: 32,
  message: '密码长度需为 6-32 位',
  trigger: 'blur',
}

export const nameRule: FormItemRule = {
  max: 30,
  message: '名称最多 30 个字符',
  trigger: 'blur',
}

/** 确认密码校验：与首个字段值比较 */
export function confirmFieldRule(getValue: () => string, message = '两次输入的密码不一致'): FormItemRule {
  return {
    validator: (_rule, value, callback) => {
      if (value !== getValue()) {
        callback(new Error(message))
        return
      }
      callback()
    },
    trigger: 'blur',
  }
}

/* ------------------------------ 收款进件 ------------------------------ */

/** 特约商户号（sub_mchid / 支付宝 partner id）：2-32 位字母数字 */
export const CHANNEL_ACCOUNT_PATTERN = /^[A-Za-z0-9]{2,32}$/

/** 营业执照号：填写则 18 位 */
export const LICENSE_NO_PATTERN = /^\S{18}$/

/** 结算账号：填写则 12-30 位数字 */
export const SETTLE_ACCOUNT_NO_PATTERN = /^\d{12,30}$/

export const channelAccountRule: FormItemRule = {
  pattern: CHANNEL_ACCOUNT_PATTERN,
  message: '特约商户号为 2-32 位字母或数字',
  trigger: 'blur',
}

/** 选填字段：留空跳过校验，填写后按给定正则校验（与后端「若填则校验」规则一致） */
export function optionalPatternRule(pattern: RegExp, message: string): FormItemRule {
  return {
    validator: (_rule, value, callback) => {
      const text = typeof value === 'string' ? value.trim() : ''
      if (text === '' || pattern.test(text)) {
        callback()
        return
      }
      callback(new Error(message))
    },
    trigger: 'blur',
  }
}

export const licenseNoRule: FormItemRule = optionalPatternRule(LICENSE_NO_PATTERN, '营业执照号为 18 位')

export const settleAccountNoRule: FormItemRule = optionalPatternRule(
  SETTLE_ACCOUNT_NO_PATTERN,
  '结算账号为 12-30 位数字',
)

export const contactPhoneRule: FormItemRule = optionalPatternRule(
  telephonePattern,
  '请填写正确的手机号或座机号',
)
