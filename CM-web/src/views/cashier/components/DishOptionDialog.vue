<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'

import { QUERY_KEYS } from '@/api/keys'
import { fetchDishDetail } from '@/api/order'
import type { OrderOptionSelectionInput } from '@/api/types/cashier'
import type { DishItem, DishOptionGroup, DishSku } from '@/api/types/order'
import { useCartStore } from '@/stores/cart'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  dish: DishItem | null
}>()

const cart = useCartStore()

const quantity = ref(1)
const chosenSkuId = ref<number>(-1)
/** groupId -> 选中的选项名 */
const chosenOptions = ref<Record<number, string[]>>({})

const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.dishDetail, props.dish?.id ?? 0]),
  queryFn: () => fetchDishDetail(props.dish!.id),
  enabled: computed(() => visible.value && props.dish !== null),
})

const detail = computed(() => detailQuery.data.value ?? null)
const skus = computed<DishSku[]>(() => detail.value?.skus ?? [])
const groups = computed<DishOptionGroup[]>(() => detail.value?.optionGroups ?? [])

const chosenSku = computed<DishSku | null>(
  () => skus.value.find((sku) => sku.id === chosenSkuId.value) ?? null,
)

/** 基础价：选了规格用规格价，否则用菜品价 */
const basePrice = computed(() => chosenSku.value?.price ?? props.dish?.price ?? 0)

/** 加料差价合计 */
const optionDelta = computed(() =>
  groups.value.reduce((total, group) => {
    const picked = chosenOptions.value[group.id] ?? []
    return (
      total +
      group.options
        .filter((option) => picked.includes(option.name))
        .reduce((sum, option) => sum + option.priceDelta, 0)
    )
  }, 0),
)

/** 单价合计。这只是给收银员看的即时反馈，权威金额仍由后端算价接口给出。 */
const unitPrice = computed(() => basePrice.value + optionDelta.value)
const totalPrice = computed(() => unitPrice.value * quantity.value)

const missingRequired = computed(() =>
  groups.value.filter((group) => group.required && (chosenOptions.value[group.id] ?? []).length === 0),
)

watch(
  () => [visible.value, props.dish?.id] as const,
  ([open]) => {
    if (!open) return
    quantity.value = 1
    // 默认选中第一个规格：绝大多数菜只有「份量」一组，替收银员省一次点击
    chosenSkuId.value = -1
    chosenOptions.value = {}
    if (skus.value.length > 0) {
      chosenSkuId.value = skus.value[0]?.id ?? -1
    }
  },
  { immediate: true },
)

/** 规格加载完之后补一次默认值（首次打开时 query 还没回来） */
watch(skus, (list) => {
  if (visible.value && chosenSkuId.value === -1 && list.length > 0) {
    chosenSkuId.value = list[0]?.id ?? -1
  }
})

function isChosen(group: DishOptionGroup, name: string): boolean {
  return (chosenOptions.value[group.id] ?? []).includes(name)
}

function toggleOption(group: DishOptionGroup, name: string): void {
  const current = chosenOptions.value[group.id] ?? []
  if (group.type === 'single') {
    chosenOptions.value = { ...chosenOptions.value, [group.id]: current.includes(name) ? [] : [name] }
    return
  }
  const next = current.includes(name)
    ? current.filter((item) => item !== name)
    : [...current, name]
  chosenOptions.value = { ...chosenOptions.value, [group.id]: next }
}

function handleConfirm(): void {
  const dish = props.dish
  if (!dish) return

  if (missingRequired.value.length > 0) {
    ElMessage.warning(`请先选择${missingRequired.value.map((group) => group.name).join('、')}`)
    return
  }

  const selections: OrderOptionSelectionInput[] = Object.entries(chosenOptions.value)
    .filter(([, names]) => names.length > 0)
    .map(([groupId, names]) => ({ groupId: Number(groupId), optionNames: names }))

  const optionText = groups.value
    .flatMap((group) =>
      (chosenOptions.value[group.id] ?? []).map((name) => {
        const option = group.options.find((item) => item.name === name)
        return option && option.priceDelta > 0 ? `${name} +${formatMoney(option.priceDelta)}` : name
      }),
    )
    .join(' / ')

  cart.addLine({
    dishId: dish.id,
    name: dish.name,
    image: dish.image,
    skuId: chosenSku.value?.id ?? -1,
    skuName: chosenSku.value?.name ?? '',
    optionSummary: optionText,
    selections,
    quantity: quantity.value,
  })
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" :title="dish?.name ?? '选择规格'" width="560px" destroy-on-close>
    <div v-loading="detailQuery.isFetching.value" class="option-body">
      <p v-if="dish?.subtitle" class="option-sub">{{ dish.subtitle }}</p>

      <div v-if="skus.length > 0" class="option-group">
        <div class="option-group__title">规格</div>
        <div class="option-chips">
          <button
            v-for="sku in skus"
            :key="sku.id"
            type="button"
            class="chip"
            :class="{ 'chip--on': sku.id === chosenSkuId }"
            @click="chosenSkuId = sku.id"
          >
            {{ sku.name }}
            <span v-if="sku.price !== dish?.price" class="chip__delta">
              {{ formatMoney(sku.price) }}
            </span>
          </button>
        </div>
      </div>

      <div v-for="group in groups" :key="group.id" class="option-group">
        <div class="option-group__title">
          {{ group.name }}
          <span v-if="group.required" class="option-group__required">必选</span>
          <span v-else class="option-group__optional">{{ group.type === 'multi' ? '可多选' : '单选' }}</span>
        </div>
        <div class="option-chips">
          <button
            v-for="option in group.options"
            :key="option.name"
            type="button"
            class="chip"
            :class="{ 'chip--on': isChosen(group, option.name) }"
            @click="toggleOption(group, option.name)"
          >
            {{ option.name }}
            <span v-if="option.priceDelta > 0" class="chip__delta">+{{ formatMoney(option.priceDelta) }}</span>
          </button>
        </div>
      </div>

      <p v-if="skus.length === 0 && groups.length === 0 && !detailQuery.isFetching.value" class="text-muted">
        这道菜没有规格与加料，直接改数量即可。
      </p>
    </div>

    <template #footer>
      <div class="option-foot">
        <div class="option-stepper">
          <el-button :disabled="quantity <= 1" @click="quantity -= 1">−</el-button>
          <span class="option-qty">{{ quantity }}</span>
          <el-button @click="quantity += 1">＋</el-button>
        </div>
        <div class="option-total">
          <span class="option-total__label">合计</span>
          <span class="option-total__value">{{ formatMoney(totalPrice) }}</span>
        </div>
        <el-button type="primary" size="large" @click="handleConfirm">加入购物车</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.option-body {
  min-height: 120px;
  max-height: 52vh;
  overflow-y: auto;
}

.option-sub {
  margin: 0 0 12px;
  font-size: 13px;
  color: #909399;
}

.option-group {
  margin-bottom: 16px;
}

.option-group__title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.option-group__required {
  margin-left: 6px;
  font-size: 12px;
  color: #f56c6c;
}

.option-group__optional {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.option-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 6px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip:hover {
  border-color: var(--cm-brand);
  color: var(--cm-brand);
}

.chip--on {
  border-color: var(--cm-brand);
  color: var(--cm-brand);
  background: #eef2ff;
  font-weight: 500;
}

.chip__delta {
  margin-left: 4px;
  font-size: 12px;
}

.option-foot {
  display: flex;
  align-items: center;
  gap: 16px;
}

.option-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-qty {
  min-width: 32px;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
}

.option-total {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.option-total__label {
  font-size: 13px;
  color: #909399;
}

.option-total__value {
  font-size: 20px;
  font-weight: 600;
  color: #f56c6c;
}
</style>
