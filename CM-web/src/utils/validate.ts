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

export const passwordRule: FormItemRule = {
  min: 6,
  max: 32,
  message: '密码长度需为 6-32 位',
  trigger: 'blur',
}
