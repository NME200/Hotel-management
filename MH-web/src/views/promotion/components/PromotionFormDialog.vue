<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { fetchCategories } from '@/api/category'
import { fetchDishes } from '@/api/dish'
import { createPromotion, updatePromotion } from '@/api/promotion'
import { QUERY_KEYS } from '@/api/keys'
import type { Category } from '@/api/types/category'
import type { DishBrief } from '@/api/types/dish'
import type {
  Promotion,
  PromotionInput,
  PromotionScopeType,
  PromotionStatus,
  PromotionType,
} from '@/api/types/promotion'
import { DATETIME_PATTERN } from '@/constants/date-patterns'
import {
  PROMOTION_SCOPE_OPTIONS,
  PROMOTION_STATUS_OPTIONS,
  PROMOTION_TYPE_OPTIONS,
  promotionFoldText,
} from '@/constants/dictionary'
import { formatDateTime, formatMoney } from '@/utils/format'
import { requiredRule } from '@/utils/validate'

/** 范围候选一次多取一些：分类和菜品都不该只有前 20 条可选 */
/** 分页上限是 100（后端 PageQueryDto 的 @Max），给大了整条请求会被 400 挡掉 */
const SCOPE_OPTION_SIZE = 100

const visible = defineModel<boolean>({ required: true })

/** 有值表示编辑，为空表示新增 */
const props = defineProps<{ record: Promotion | null }>()

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  name: '',
  badge: '',
  type: 'price' as PromotionType,
  price: undefined as number | undefined,
  discount: 0.6 as number | undefined,
  scopeType: 'all' as PromotionScopeType,
  scopeIds: [] as number[],
  startsAt: '',
  endsAt: '',
  status: 'enabled' as PromotionStatus,
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑限时活动' : '新增限时活动'))

const rules: FormRules<typeof form> = {
  name: [requiredRule('请输入活动名称'), { max: 64, message: '名称最多 64 个字符', trigger: 'blur' }],
  badge: [{ max: 16, message: '角标最多 16 个字符', trigger: 'blur' }],
  // 算法与数值必须成对：与当前算法不匹配的那个数不参与校验，也不提交
  price: [
    {
      validator: (_rule, _value, callback) => {
        if (form.type !== 'price') {
          callback()
          return
        }
        const price = Number(form.price)
        if (!form.price || Number.isNaN(price) || price <= 0) {
          callback(new Error('请填写活动价，且要大于 0'))
          return
        }
        if (price > 99999) {
          callback(new Error('活动价不能超过 99999 元'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  discount: [
    {
      validator: (_rule, _value, callback) => {
        if (form.type !== 'discount') {
          callback()
          return
        }
        const discount = Number(form.discount)
        if (!form.discount || Number.isNaN(discount) || discount < 0.01 || discount > 0.99) {
          callback(new Error('折扣要填 0.01 ~ 0.99 之间的实付比例，如 0.6 表示 6 折'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  scopeIds: [
    {
      validator: (_rule, _value, callback) => {
        if (form.scopeType !== 'all' && form.scopeIds.length === 0) {
          callback(new Error(form.scopeType === 'dish' ? '请至少选择一个菜品' : '请至少选择一个分类'))
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

/** 分类候选：单独一个缓存键，避免和菜品管理页那份 100 条的选项混用 */
const categoryQuery = useQuery({
  queryKey: [...QUERY_KEYS.categories, 'promotion-scope'],
  queryFn: () => fetchCategories({ page: 1, pageSize: SCOPE_OPTION_SIZE }),
  enabled: computed(() => visible.value && form.scopeType === 'category'),
  staleTime: 300_000,
})
const categories = computed<Category[]>(() => categoryQuery.data.value?.list ?? [])

/** 菜品候选：按菜品时要选它，按活动价时也要拿原价来做比价提示 */
const dishQuery = useQuery({
  queryKey: [...QUERY_KEYS.dishes, 'promotion-scope'],
  queryFn: () => fetchDishes({ page: 1, pageSize: SCOPE_OPTION_SIZE }),
  enabled: computed(() => visible.value && (form.scopeType === 'dish' || form.type === 'price')),
  staleTime: 300_000,
})
const dishes = computed<DishBrief[]>(() => dishQuery.data.value?.list ?? [])

/** 落在本次活动范围内的菜品，用来判断活动价到底有没有真的更低 */
const scopedDishes = computed<DishBrief[]>(() => {
  if (form.scopeType === 'all') return dishes.value
  if (form.scopeType === 'category') return dishes.value.filter((item) => form.scopeIds.includes(item.categoryId))
  return dishes.value.filter((item) => form.scopeIds.includes(item.id))
})

const priceHint = computed<string>(() => {
  if (form.type !== 'price') return ''
  const price = Number(form.price)
  if (!form.price || Number.isNaN(price)) return ''
  const notCheaper = scopedDishes.value.filter((item) => price >= item.price)
  if (notCheaper.length === 0) return ''
  const sample = notCheaper[0]
  return (
    `有 ${notCheaper.length} 个菜品的活动价不低于原价` +
    `${sample ? `（例如「${sample.name}」原价 ${formatMoney(sample.price)}）` : ''}，` +
    '这些菜仍按原价结算，顾客只会看到活动标却省不到钱。'
  )
})

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        name: props.record.name,
        badge: props.record.badge ?? '',
        type: props.record.type,
        // 库里存的是分与实付比例字符串，回到表单要换成元与 number
        price: props.record.priceCents === null ? undefined : props.record.priceCents / 100,
        // decimal 列回传的是字符串，直接 Number() 会给 el-input-number 留下浮点噪声（0.80000001192）
        discount:
          props.record.discountRatio === null
            ? undefined
            : Number(Number(props.record.discountRatio).toFixed(4)),
        scopeType: props.record.scopeType,
        scopeIds: [...(props.record.scopeIds ?? [])],
        startsAt: props.record.startsAt ? formatDateTime(props.record.startsAt) : '',
        endsAt: props.record.endsAt ? formatDateTime(props.record.endsAt) : '',
        status: props.record.status,
      })
    } else {
      Object.assign(form, {
        name: '',
        badge: '',
        type: 'price' as PromotionType,
        price: undefined,
        discount: 0.6,
        scopeType: 'all' as PromotionScopeType,
        scopeIds: [] as number[],
        startsAt: '',
        endsAt: '',
        status: 'enabled' as PromotionStatus,
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

// 切算法时清掉另一个数，否则改了类型还会把旧数值提交上去
watch(
  () => form.type,
  (type, previous) => {
    if (type === previous) return
    if (type === 'price') form.discount = undefined
    else form.price = undefined
  },
)

// 全部菜品不需要名单，清空避免切回按分类/菜品时带着上次的选择
watch(
  () => form.scopeType,
  (scopeType) => {
    if (scopeType === 'all') form.scopeIds = []
  },
)

const saveMutation = useMutation({
  mutationFn: (payload: PromotionInput) =>
    props.record ? updatePromotion(props.record.id, payload) : createPromotion(payload),
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '活动已更新，顾客端结算价随之变化' : '活动已创建，到时间就按活动价结算')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.promotions })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activities })
    visible.value = false
    emit('saved')
  },
})

function buildPayload(): PromotionInput {
  const payload: PromotionInput = {
    name: form.name.trim(),
    badge: form.badge.trim() || null,
    type: form.type,
    scopeType: form.scopeType,
    status: form.status,
    // 时间必须留 null 而不是空串：后端把 undefined 当「不改」，把 null 当「清空」
    // 且按本地墙钟解析，直接发 ISO 串会整体偏 8 小时
    startsAt: form.startsAt || null,
    endsAt: form.endsAt || null,
  }
  // 与算法不匹配的数不发：后端按 type 重建两列，旧值自己会被清成 null
  if (form.type === 'price') payload.price = Number(form.price)
  else payload.discount = Number(form.discount)
  // 全部菜品时不发名单，后端同样会清空
  if (form.scopeType !== 'all') payload.scopeIds = [...form.scopeIds]
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

      <el-form-item label="角标" prop="badge">
        <el-input v-model="form.badge" maxlength="16" show-word-limit placeholder="留空显示「活动」" />
        <span class="form-tip">顾客端卡片左上角那两个字，如「限时」「特惠」</span>
      </el-form-item>

      <el-form-item label="优惠方式" prop="type">
        <el-radio-group v-model="form.type">
          <el-radio-button v-for="item in PROMOTION_TYPE_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.type === 'price'" label="活动价" prop="price">
        <el-input-number
          v-model="form.price"
          :min="0.01"
          :max="99999"
          :precision="2"
          :step="1"
          :value-on-clear="undefined"
          controls-position="right"
        />
        <span class="form-tip">单位元，必须低于菜品原价才会改价</span>
        <p v-if="priceHint" class="form-warning">{{ priceHint }}</p>
      </el-form-item>

      <el-form-item v-if="form.type === 'discount'" label="折扣" prop="discount">
        <el-input-number
          v-model="form.discount"
          :min="0.01"
          :max="0.99"
          :precision="2"
          :step="0.05"
          :value-on-clear="undefined"
          controls-position="right"
        />
        <span class="form-tip">填的是实付比例：0.6 就是 6 折</span>
        <p class="form-warning">
          当前设置相当于 {{ promotionFoldText(form.discount) }} 折，按菜品原价算折后价，再与会员价取低。
        </p>
      </el-form-item>

      <el-form-item label="适用范围" prop="scopeType">
        <el-radio-group v-model="form.scopeType">
          <el-radio-button v-for="item in PROMOTION_SCOPE_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.scopeType === 'category'" label="选择分类" prop="scopeIds">
        <el-select
          v-model="form.scopeIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :loading="categoryQuery.isFetching.value"
          placeholder="可多选，分类下的菜品都参与"
          class="full-width"
        >
          <el-option
            v-for="item in categories"
            :key="item.id"
            :label="`${item.name}（${item.dishCount} 个菜）`"
            :value="item.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item v-if="form.scopeType === 'dish'" label="选择菜品" prop="scopeIds">
        <el-select
          v-model="form.scopeIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :loading="dishQuery.isFetching.value"
          placeholder="可多选，标签上的价格就是原价"
          class="full-width"
        >
          <el-option
            v-for="item in dishes"
            :key="item.id"
            :label="`${item.name}（${formatMoney(item.price)}）`"
            :value="item.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="生效开始" prop="startsAt">
        <el-date-picker
          v-model="form.startsAt"
          type="datetime"
          placeholder="留空表示立即开始"
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

      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button v-for="item in PROMOTION_STATUS_OPTIONS" :key="item.value" :value="item.value">
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

.form-warning {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #e6a23c;
}
</style>
