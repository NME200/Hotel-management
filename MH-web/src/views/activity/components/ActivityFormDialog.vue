<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createActivity, updateActivity } from '@/api/activity'
import { QUERY_KEYS } from '@/api/keys'
import { fetchPromotions } from '@/api/promotion'
import type {
  Activity,
  ActivityAction,
  ActivityInput,
  ActivitySlot,
  ActivityStatus,
} from '@/api/types/activity'
import type { Promotion } from '@/api/types/promotion'
import { DATETIME_PATTERN } from '@/constants/date-patterns'
import {
  ACTIVITY_ACTION_OPTIONS,
  ACTIVITY_ICON_OPTIONS,
  ACTIVITY_SLOT_OPTIONS,
  ACTIVITY_STATUS_OPTIONS,
  promotionPriceText,
} from '@/constants/dictionary'
import { formatDateTime } from '@/utils/format'
import { requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

/** 有值表示编辑，为空表示新增 */
const props = defineProps<{ record: Activity | null }>()

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive<ActivityInput & {
  name: string
  slot: ActivitySlot
  title: string
  subTitle: string
  icon: string
  action: ActivityAction
  promotionId: number | undefined
  startsAt: string
  endsAt: string
  status: ActivityStatus
}>({
  name: '',
  slot: 'home',
  title: '',
  subTitle: '',
  icon: 'bolt',
  action: 'menu',
  promotionId: undefined,
  startsAt: '',
  endsAt: '',
  status: 'enabled',
  sort: 0,
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑活动' : '新增活动'))

const rules: FormRules<typeof form> = {
  name: [requiredRule('请输入活动名称'), { max: 64, message: '名称最多 64 个字符', trigger: 'blur' }],
  slot: [requiredRule('请选择展示位')],
  title: [requiredRule('请输入顾客端主标题'), { max: 64, message: '主标题最多 64 个字符', trigger: 'blur' }],
  // 跳转选了「限时活动」却不给活动 ID，顾客点卡片会没反应，后端同样会挡
  promotionId: [
    {
      validator: (_rule, _value, callback) => {
        if (form.action === 'promotion' && !form.promotionId) {
          callback(new Error('请选择要关联的限时活动'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  // 时间成对校验：只填一端是配错了，两端都填则顺序不能反
  endsAt: [
    {
      validator: (_rule, _value, callback) => {
        if (form.startsAt && form.endsAt && new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()) {
          callback(new Error('结束时间必须晚于开始时间'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

/** 候选活动不带状态过滤：停用中的活动也可能已经挂在卡片上，标签总得念得出名字 */
const promotionQuery = useQuery({
  queryKey: [...QUERY_KEYS.promotions, 'options'],
  queryFn: () => fetchPromotions({ page: 1, pageSize: 100 }),
  enabled: computed(() => visible.value),
  staleTime: 60_000,
})

const promotionOptions = computed<Promotion[]>(() => promotionQuery.data.value?.list ?? [])

/** 标签带上优惠方式，商户才知道点进去看到的是哪种活动 */
function promotionOptionLabel(row: Promotion): string {
  return `${row.name}（${promotionPriceText(row)}）`
}

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        name: props.record.name,
        slot: props.record.slot,
        title: props.record.title,
        subTitle: props.record.subTitle ?? '',
        icon: props.record.icon ?? '',
        action: props.record.action,
        promotionId: props.record.promotionId ?? undefined,
        startsAt: props.record.startsAt ? formatDateTime(props.record.startsAt) : '',
        endsAt: props.record.endsAt ? formatDateTime(props.record.endsAt) : '',
        status: props.record.status,
        sort: props.record.sort,
      })
    } else {
      Object.assign(form, {
        name: '',
        slot: 'home' as ActivitySlot,
        title: '',
        subTitle: '',
        icon: 'bolt',
        action: 'menu' as ActivityAction,
        promotionId: undefined,
        startsAt: '',
        endsAt: '',
        status: 'enabled' as ActivityStatus,
        sort: 0,
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

// 跳转换了目标，之前选的活动就没意义了，清掉免得提交时还带着 ID
watch(
  () => form.action,
  (action) => {
    if (action !== 'promotion') form.promotionId = undefined
  },
)

const saveMutation = useMutation({
  mutationFn: (payload: ActivityInput) =>
    props.record ? updateActivity(props.record.id, payload) : createActivity(payload),
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '活动已更新，小程序下一次进入对应页面就会显示新内容' : '活动已创建')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activities })
    visible.value = false
    emit('saved')
  },
})

function buildPayload(): ActivityInput {
  const payload: ActivityInput = {
    name: form.name.trim(),
    slot: form.slot,
    title: form.title.trim(),
    sort: Number(form.sort ?? 0),
    status: form.status,
    action: form.action,
  }
  // 只有跳转「限时活动」才带 ID，其余情况发 null 解除关联：后端把 undefined 当「不改」
  payload.promotionId = form.action === 'promotion' ? (form.promotionId ?? null) : null
  const subTitle = form.subTitle.trim()
  payload.subTitle = subTitle || null
  payload.icon = form.icon || null
  // 时间必须留 null 而不是空串：后端把 undefined 当「不改」，把 null 当「清空」
  payload.startsAt = form.startsAt || null
  payload.endsAt = form.endsAt || null
  return payload
}

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate(buildPayload())
  })
}
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle" width="560px" :close-on-click-modal="false">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
      <el-form-item label="活动名称" prop="name">
        <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="仅后台识别用，顾客看不到" />
      </el-form-item>

      <el-form-item label="展示位" prop="slot">
        <el-radio-group v-model="form.slot">
          <el-radio-button v-for="item in ACTIVITY_SLOT_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="主标题" prop="title">
        <el-input v-model="form.title" maxlength="64" show-word-limit placeholder="如：全场 6 折 限时开抢" />
      </el-form-item>

      <el-form-item label="副标题" prop="subTitle">
        <el-input v-model="form.subTitle" type="textarea" :rows="2" maxlength="128" show-word-limit />
      </el-form-item>

      <el-form-item label="图标" prop="icon">
        <el-select v-model="form.icon" placeholder="不显示图标" clearable>
          <el-option
            v-for="item in ACTIVITY_ICON_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="点击跳转" prop="action">
        <el-select v-model="form.action">
          <el-option
            v-for="item in ACTIVITY_ACTION_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item v-if="form.action === 'promotion'" label="关联限时活动" prop="promotionId">
        <el-select
          v-model="form.promotionId"
          filterable
          :loading="promotionQuery.isFetching.value"
          placeholder="请选择要跳转的限时活动"
          class="full-width"
        >
          <el-option
            v-for="item in promotionOptions"
            :key="item.id"
            :label="promotionOptionLabel(item)"
            :value="item.id"
          />
        </el-select>
        <span class="form-tip">顾客点这张卡片会进菜单，并且只看这个活动参与中的菜品</span>
      </el-form-item>

      <el-form-item label="生效开始" prop="startsAt">
        <el-date-picker
          v-model="form.startsAt"
          type="datetime"
          placeholder="留空表示立即生效"
          :value-format="DATETIME_PATTERN"
          clearable
          class="full-width"
        />
      </el-form-item>

      <el-form-item label="生效结束" prop="endsAt">
        <el-date-picker
          v-model="form.endsAt"
          type="datetime"
          placeholder="留空表示长期有效"
          :value-format="DATETIME_PATTERN"
          clearable
          class="full-width"
        />
      </el-form-item>

      <el-form-item label="排序" prop="sort">
        <el-input-number v-model="form.sort" :min="0" :max="9999" :step="10" controls-position="right" />
        <span class="form-tip">数值越小越靠前</span>
      </el-form-item>

      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button v-for="item in ACTIVITY_STATUS_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.full-width {
  width: 100%;
}

.form-tip {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
