import type { FormItemRule } from 'element-plus'

/** 手机号（11 位，1 开头） */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/

/** 联系电话：手机或带区号的座机 */
export const TELEPHONE_PATTERN = /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/

/** 商户编码：3-32 位大写字母或数字（后端同一规则） */
export const MERCHANT_CODE_PATTERN = /^[A-Z0-9]{3,32}$/

/** 小程序 AppID：wx 开头的小写字母数字串（后端只限 64 字符，这里给运营做前置纠错） */
export const MINI_APP_ID_PATTERN = /^wx[0-9a-z]{8,62}$/

/** 账号：3-32 位字母、数字或下划线（后端同一规则） */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/

export const requiredRule = (message: string): FormItemRule => ({
  required: true,
  message,
  trigger: ['blur', 'change'],
})

/** 长度区间校验，用于后端声明的 min-max 字符数 */
export function lengthRule(min: number, max: number, label: string): FormItemRule {
  return {
    min,
    max,
    message: `${label}长度需为 ${min}-${max} 个字符`,
    trigger: ['blur', 'change'],
  }
}

export const phoneRule: FormItemRule = {
  pattern: PHONE_PATTERN,
  message: '手机号格式不正确',
  trigger: 'blur',
}

export const telephoneRule: FormItemRule = {
  pattern: TELEPHONE_PATTERN,
  message: '请填写正确的手机号或座机号',
  trigger: 'blur',
}

/** 登录密码 / 初始密码：后端限制 6-64 位 */
export const passwordRule: FormItemRule = {
  min: 6,
  max: 64,
  message: '密码长度需为 6-64 位',
  trigger: 'blur',
}

export const merchantCodeRule: FormItemRule = {
  pattern: MERCHANT_CODE_PATTERN,
  message: '商户号为 3-32 位大写字母或数字',
  trigger: 'blur',
}

/** 小程序 AppID：wx 开头，全小写。留空由 requiredRule 负责提示 */
export const miniAppIdRule: FormItemRule = {
  pattern: MINI_APP_ID_PATTERN,
  message: 'AppID 应为 wx 开头的小写字母数字串，请核对小程序后台',
  trigger: 'blur',
}

export const usernameRule: FormItemRule = {
  pattern: USERNAME_PATTERN,
  message: '账号为 3-32 位字母、数字或下划线',
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

/** 图片地址：留空视为不设置，填写则必须是 http(s) 或站内相对路径 */
export const imageUrlRule: FormItemRule = {
  validator: (_rule, value, callback) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || /^https?:\/\//.test(text) || text.startsWith('/')) {
      callback()
      return
    }
    callback(new Error('请填写 http(s) 开头的图片地址'))
  },
  trigger: 'blur',
}

/** 支付回调地址：留空表示不设置（后端按未配置处理），填写则必须是 http(s) 绝对地址 */
export const notifyUrlRule: FormItemRule = {
  validator: (_rule, value, callback) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || /^https?:\/\/\S+$/.test(text)) {
      callback()
      return
    }
    callback(new Error('请填写 http(s) 开头的完整回调地址，不能有空格'))
  },
  trigger: 'blur',
}
