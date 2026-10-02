<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createMerchant, fetchMerchantDetail, updateMerchant } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import type { MerchantChannelCommission, MerchantListItem } from '@/api/types/merchant'
import {
  confirmFieldRule,
  imageUrlRule,
  lengthRule,
  merchantCodeRule,
  passwordRule,
  requiredRule,
  telephoneRule,
  usernameRule,
} from '@/utils/validate'
import ImageUrlField from '@/components/common/ImageUrlField.vue'

/** 平台抽佣上限 10%，与后端 MAX_COMMISSION_RATE 保持一致 */
const MAX_COMMISSION_RATE = 0.1
/** decimal(6,4) 只存 4 位小数，界面多输的小数位会被静默截断，所以提前拦住 */
const COMMISSION_DECIMALS = 4

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: MerchantListItem | null }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  code: '',
  name: '',
  contactName: '',
  contactPhone: '',
  logo: '' as string | null,
  remark: '',
  /** 空串表示不限期 */
  expireAt: '',
  adminUsername: '',
  adminRealName: '',
  adminPassword: '',
  confirmPassword: '',
  /** 抽佣比例，用字符串绑定以保留「空」这个状态；提交时转数字或 null */
  wechatRate: '',
  alipayRate: '',
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑商户资料' : '开通商户'))

/**
 * 抽佣不在列表接口里，只有详情才有，所以编辑态单独拉一次详情。
 * 未申请进件的渠道没有可写的行，后端会拒绝，这里提前置灰，别让用户白填。
 */
const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantDetail, props.record?.id ?? 0]),
  queryFn: () => fetchMerchantDetail(props.record?.id as number),
  enabled: computed(() => visible.value && isEdit.value),
})

const commissions = computed<MerchantChannelCommission[]>(
  () => detailQuery.data.value?.commissions ?? [],
)

function commissionOf(channel: 'wechat' | 'alipay'): MerchantChannelCommission | null {
  return commissions.value.find((item) => item.channel === channel) ?? null
}

const wechatCommission = computed(() => commissionOf('wechat'))
const alipayCommission = computed(() => commissionOf('alipay'))

/** 详情还没回来时不能判定「不可编辑」，否则会闪一下灰 */
const commissionLoading = computed(() => detailQuery.isFetching.value)

function commissionEditable(item: MerchantChannelCommission | null): boolean {
  return item?.configured === true
}

/** 比例 -> 界面字符串：0.0038 显示成 "0.38"，避免用户面对 0.0038 这种形式 */
function rateToInput(rate: number | null): string {
  if (rate === null || rate === undefined) return ''
  return String(Number((rate * 100).toFixed(4)))
}

/** 界面字符串 -> 比例：空串视为「不修改」，所以返回 undefined */
function inputToRate(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const yuan = Number(trimmed)
  if (Number.isNaN(yuan)) return undefined
  return Number((yuan / 100).toFixed(6))
}

function validateCommission(text: string): true | string {
  const trimmed = text.trim()
  if (trimmed === '') return true
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return '只能填数字，如 0.38'
  const value = Number(trimmed)
  if (value < 0) return '不能为负数'
  if (value > MAX_COMMISSION_RATE * 100) return `不能超过 ${MAX_COMMISSION_RATE * 100}%`
  const decimals = (trimmed.split('.')[1] ?? '').length
  if (decimals > COMMISSION_DECIMALS) return `最多 ${COMMISSION_DECIMALS} 位小数`
  return true
}

/** el-form 的自定义校验器：返回 true 通过，返回 Error 显示 message */
function commissionValidator(
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void,
): void {
  const result = validateCommission(String(value ?? ''))
  callback(result === true ? undefined : new Error(result))
}

const rules = computed<FormRules<typeof form>>(() => ({
  code: isEdit.value ? [] : [requiredRule('请输入商户编码'), merchantCodeRule],
  name: [requiredRule('请输入商户名称'), lengthRule(2, 128, '商户名称')],
  contactName: [requiredRule('请输入联系人'), lengthRule(2, 64, '联系人')],
  contactPhone: [requiredRule('请输入联系电话'), telephoneRule],
  logo: [imageUrlRule],
  remark: [lengthRule(0, 200, '备注')],
  wechatRate: [{ validator: commissionValidator }],
  alipayRate: [{ validator: commissionValidator }],
  adminUsername: isEdit.value ? [] : [requiredRule('请输入老板登录账号'), usernameRule],
  adminRealName: isEdit.value ? [] : [requiredRule('请输入老板姓名'), lengthRule(2, 64, '老板姓名')],
  adminPassword: isEdit.value ? [] : [requiredRule('请输入老板初始密码'), passwordRule],
  confirmPassword: isEdit.value
    ? []
    : [requiredRule('请再次输入老板初始密码'), confirmFieldRule(() => form.adminPassword)],
}))

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        code: props.record.code,
        name: props.record.name,
        contactName: props.record.contactName,
        contactPhone: props.record.contactPhone,
        logo: props.record.logo ?? '',
        remark: props.record.remark ?? '',
        expireAt: props.record.expireAt ? props.record.expireAt.slice(0, 10) : '',
        adminUsername: '',
        adminRealName: '',
        adminPassword: '',
        confirmPassword: '',
      })
    } else {
      Object.assign(form, {
        code: '',
        name: '',
        contactName: '',
        contactPhone: '',
        logo: '',
        remark: '',
        expireAt: '',
        adminUsername: '',
        adminRealName: '',
        adminPassword: '',
        confirmPassword: '',
        wechatRate: '',
        alipayRate: '',
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

/** 详情回来后回填抽佣输入框；用 watch 而不是在 setup 里直接读，避免拿到空数据 */
watch(commissions, (list) => {
  if (!visible.value || list.length === 0) return
  form.wechatRate = rateToInput(list.find((item) => item.channel === 'wechat')?.profitShareRate ?? null)
  form.alipayRate = rateToInput(list.find((item) => item.channel === 'alipay')?.profitShareRate ?? null)
})

/**
 * 只提交真正改过的渠道：值没变就不带该键，后端据此跳过写入与审计，
 * 避免「打开弹窗点确定」也生成一条审计。
 */
function buildCommissionInput(): { wechat?: number | null; alipay?: number | null } | undefined {
  const input: { wechat?: number | null; alipay?: number | null } = {}
  const pairs = [
    ['wechat', form.wechatRate, wechatCommission.value] as const,
    ['alipay', form.alipayRate, alipayCommission.value] as const,
  ]
  for (const [channel, text, commission] of pairs) {
    // 未进件的渠道界面已置灰，即便有残留输入也不提交
    if (!commissionEditable(commission)) continue
    const next = inputToRate(text)
    if (next === undefined) continue
    if (next === (commission?.profitShareRate ?? null)) continue
    input[channel] = next
  }
  return Object.keys(input).length > 0 ? input : undefined
}

const saveMutation = useMutation({
  mutationFn: () => {
    const logo = (form.logo ?? '').trim()
    // logo 留空时不提交该字段，避免后端对可选 URL 字段的空串校验报错
    const common = {
      name: form.name.trim(),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim(),
      ...(logo ? { logo } : {}),
      remark: form.remark.trim(),
      // 空串即后端约定的「不限期」，必须显式提交
      expireAt: form.expireAt,
    }
    if (props.record) {
      const profitShareRates = buildCommissionInput()
      return updateMerchant(props.record.id, {
        ...common,
        ...(profitShareRates ? { profitShareRates } : {}),
      })
    }
    return createMerchant({
      ...common,
      code: form.code.trim().toUpperCase(),
      adminUsername: form.adminUsername.trim(),
      adminRealName: form.adminRealName.trim(),
      adminPassword: form.adminPassword,
    })
  },
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '商户资料已更新' : '商户已开通，状态为待审核，请在列表中完成审核')
    // 商户列表、详情、到期预警与看板都依赖商户数据，一并失效重新拉取
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.merchants })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.merchantDetail })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expiring })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard })
    // 抽佣改完，进件页与分账页的展示也要跟着刷新
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.merchantPayment })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformProfitShares })
    visible.value = false
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate()
  })
}

function handleCodeInput(): void {
  form.code = form.code.toUpperCase().replace(/\s/g, '')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="620px"
    top="6vh"
    :close-on-click-modal="false"
    @closed="formRef?.clearValidate()"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="106px">
      <el-form-item label="商户编码" prop="code">
        <el-input
          v-model="form.code"
          :disabled="isEdit"
          maxlength="32"
          placeholder="3-32 位大写字母或数字，如 SHOP001"
          @input="handleCodeInput"
        />
        <p v-if="isEdit" class="table-sub-text">商户编码创建后不可修改</p>
      </el-form-item>
      <el-form-item label="商户名称" prop="name">
        <el-input v-model="form.name" maxlength="128" placeholder="如：老王快餐连锁" />
      </el-form-item>
      <el-form-item label="联系人" prop="contactName">
        <el-input v-model="form.contactName" maxlength="64" placeholder="商户对接人姓名" />
      </el-form-item>
      <el-form-item label="联系电话" prop="contactPhone">
        <el-input v-model="form.contactPhone" maxlength="20" placeholder="手机号或带区号的座机" />
      </el-form-item>
      <el-form-item label="到期时间" prop="expireAt">
        <el-date-picker
          v-model="form.expireAt"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择到期日期"
          clearable
          class="full-width"
        />
        <p class="table-sub-text">留空表示不限期</p>
      </el-form-item>
      <el-form-item label="商户 Logo" prop="logo">
        <ImageUrlField v-model="form.logo" />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="签约信息、对接进度等，可选"
        />
      </el-form-item>

      <template v-if="isEdit">
        <el-divider content-position="left">平台抽佣比例</el-divider>
        <el-form-item label="微信抽佣" prop="wechatRate">
          <el-input
            v-model="form.wechatRate"
            :disabled="!commissionEditable(wechatCommission)"
            placeholder="如 0.38，留空表示不修改"
          >
            <template #suffix>%</template>
          </el-input>
          <p class="commission-hint">
            <template v-if="commissionLoading">正在读取当前抽佣…</template>
            <template v-else-if="commissionEditable(wechatCommission)">
              当前 <span class="table-mono">{{ wechatCommission?.profitShareRate === null ? '未设置' : `${Number((wechatCommission!.profitShareRate! * 100).toFixed(4))}%` }}</span>
              ，可填 0 ~ 10%，最多 4 位小数
            </template>
            <template v-else>该商户尚未提交微信支付进件，请先在「商户支付进件」审核开通后再设置</template>
          </p>
        </el-form-item>
        <el-form-item label="支付宝抽佣" prop="alipayRate">
          <el-input
            v-model="form.alipayRate"
            :disabled="!commissionEditable(alipayCommission)"
            placeholder="如 0.5，留空表示不修改"
          >
            <template #suffix>%</template>
          </el-input>
          <p class="commission-hint">
            <template v-if="commissionLoading">正在读取当前抽佣…</template>
            <template v-else-if="commissionEditable(alipayCommission)">
              当前 <span class="table-mono">{{ alipayCommission?.profitShareRate === null ? '未设置' : `${Number((alipayCommission!.profitShareRate! * 100).toFixed(4))}%` }}</span>
              ，可填 0 ~ 10%，最多 4 位小数
            </template>
            <template v-else>该商户尚未提交支付宝进件，请先在「商户支付进件」审核开通后再设置</template>
          </p>
        </el-form-item>
        <p class="dialog-tip">
          抽佣比例在每笔支付成功时快照，修改后只对之后的支付生效，历史分账单不受影响。
        </p>
      </template>

      <template v-if="!isEdit">
        <el-divider content-position="left">老板初始账号</el-divider>
        <el-form-item label="登录账号" prop="adminUsername">
          <el-input v-model="form.adminUsername" maxlength="32" placeholder="3-32 位字母、数字或下划线" />
        </el-form-item>
        <el-form-item label="姓名" prop="adminRealName">
          <el-input v-model="form.adminRealName" maxlength="64" placeholder="老板真实姓名" />
        </el-form-item>
        <el-form-item label="初始密码" prop="adminPassword">
          <el-input v-model="form.adminPassword" type="password" show-password maxlength="64" placeholder="6-64 位" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            maxlength="64"
            placeholder="请再次输入初始密码"
          />
        </el-form-item>
        <p class="dialog-tip">开通后系统会同时创建该商户的默认门店，商户初始状态为「待审核」。</p>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-tip {
  margin: 0 0 4px;
  padding-left: 106px;
  font-size: 12px;
  color: #909399;
}

.commission-hint {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
