<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'

import { createDish, fetchDishDetail, updateDish } from '@/api/dish'
import { QUERY_KEYS } from '@/api/keys'
import type { Category } from '@/api/types/category'
import type {
  DishInput,
  DishOptionGroup,
  DishOptionItem,
  DishOptionType,
  DishSku,
  DishStatus,
  DishStockType,
} from '@/api/types/dish'
import {
  DISH_OPTION_TYPE_OPTIONS,
  DISH_STATUS_OPTIONS,
  DISH_STOCK_TYPE_OPTIONS,
  DISH_TAG_PRESETS,
  DISH_UNIT_PRESETS,
} from '@/constants/dictionary'
import { nameRule, requiredRule } from '@/utils/validate'
import ImageUrlField from '@/components/common/ImageUrlField.vue'

interface SkuRow {
  id?: number
  name: string
  price: number
  specDesc: string
  stock?: number
  sort: number
}

interface OptionRow {
  id?: number
  name: string
  priceDelta: number
  sort: number
}

interface OptionGroupRow {
  id?: number
  name: string
  type: DishOptionType
  required: boolean
  sort: number
  options: OptionRow[]
}

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  /** 传入表示编辑，为空表示新增 */
  dishId: number | null
  categories: Category[]
}>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  categoryId: undefined as number | undefined,
  name: '',
  subtitle: '',
  image: '',
  description: '',
  price: 0,
  memberPrice: undefined as number | undefined,
  unit: '份',
  stockType: 'unlimited' as DishStockType,
  stock: undefined as number | undefined,
  sort: 0,
  isRecommend: false,
  status: 'on_sale' as DishStatus,
  tags: [] as string[],
})

const skuRows = ref<SkuRow[]>([])
const optionGroups = ref<OptionGroupRow[]>([])

const isEdit = computed(() => props.dishId !== null)
const drawerTitle = computed(() => (isEdit.value ? '编辑菜品' : '新增菜品'))

const rules: FormRules<typeof form> = {
  categoryId: [requiredRule('请选择所属分类')],
  name: [requiredRule('请输入菜品名称'), nameRule],
  price: [requiredRule('请输入售价')],
  unit: [requiredRule('请选择单位')],
}

const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.dishDetail, props.dishId ?? 0]),
  queryFn: () => fetchDishDetail(props.dishId ?? 0),
  enabled: computed(() => visible.value && props.dishId !== null),
})

function emptySku(sort: number): SkuRow {
  return { name: '', price: 0, specDesc: '', sort }
}

function emptyOption(sort: number): OptionRow {
  return { name: '', priceDelta: 0, sort }
}

function emptyGroup(sort: number): OptionGroupRow {
  return { name: '', type: 'single', required: false, sort, options: [emptyOption(0)] }
}

function fillForm(source: Partial<typeof form>): void {
  Object.assign(form, source)
}

watch(
  () => [visible.value, props.dishId] as const,
  ([open]) => {
    if (!open) return
    formRef.value?.clearValidate()
    if (!props.dishId) {
      resetLocalState()
      fillForm({
        categoryId: props.categories[0]?.id,
        name: '',
        subtitle: '',
        image: '',
        description: '',
        price: 0,
        memberPrice: undefined,
        unit: '份',
        stockType: 'unlimited',
        stock: undefined,
        sort: 0,
        isRecommend: false,
        status: 'on_sale',
        tags: [],
      })
      skuRows.value = [emptySku(0)]
      optionGroups.value = []
    }
  },
  { immediate: true },
)

watch(
  () => detailQuery.data.value,
  (detail) => {
    if (!detail || !props.dishId) return
    fillForm({
      categoryId: detail.categoryId,
      name: detail.name,
      subtitle: detail.subtitle,
      image: detail.image,
      description: detail.description,
      price: detail.price,
      memberPrice: detail.memberPrice ?? undefined,
      unit: detail.unit,
      stockType: detail.stockType,
      stock: detail.stock ?? undefined,
      sort: detail.sort,
      isRecommend: detail.isRecommend,
      status: detail.status,
      tags: [...detail.tags],
    })
    skuRows.value = detail.skus.length
      ? detail.skus.map((sku) => ({
          id: sku.id,
          name: sku.name,
          price: sku.price,
          specDesc: sku.specDesc,
          stock: sku.stock ?? undefined,
          sort: sku.sort,
        }))
      : [emptySku(0)]
    optionGroups.value = detail.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      required: group.required,
      sort: group.sort,
      options: group.options.length
        ? group.options.map((option) => ({
            id: option.id,
            name: option.name,
            priceDelta: option.priceDelta,
            sort: option.sort,
          }))
        : [emptyOption(0)],
    }))
  },
  { immediate: true },
)

function resetLocalState(): void {
  skuRows.value = []
  optionGroups.value = []
}

function addSku(): void {
  skuRows.value.push(emptySku(skuRows.value.length))
}

function removeSku(index: number): void {
  skuRows.value.splice(index, 1)
}

function addOptionGroup(): void {
  optionGroups.value.push(emptyGroup(optionGroups.value.length))
}

function removeOptionGroup(index: number): void {
  optionGroups.value.splice(index, 1)
}

function addOption(group: OptionGroupRow): void {
  group.options.push(emptyOption(group.options.length))
}

function removeOption(group: OptionGroupRow, index: number): void {
  group.options.splice(index, 1)
}

function buildSkus(): DishSku[] {
  return skuRows.value
    .filter((row) => row.name.trim() !== '')
    .map((row, index) => ({
      id: row.id,
      name: row.name.trim(),
      price: Number(row.price ?? 0),
      specDesc: row.specDesc.trim(),
      stock: row.stock ?? null,
      sort: row.sort ?? index,
    }))
}

function buildOptionGroups(): DishOptionGroup[] {
  return optionGroups.value
    .filter((group) => group.name.trim() !== '')
    .map((group, index) => ({
      id: group.id,
      name: group.name.trim(),
      type: group.type,
      required: group.required,
      sort: group.sort ?? index,
      options: group.options
        .filter((option) => option.name.trim() !== '')
        .map<DishOptionItem>((option, optionIndex) => ({
          id: option.id,
          name: option.name.trim(),
          priceDelta: Number(option.priceDelta ?? 0),
          sort: option.sort ?? optionIndex,
        })),
    }))
}

function validateCustomRows(): string | null {
  const skus = skuRows.value.filter((row) => row.name.trim() !== '')
  if (skus.length === 0) return '至少填写一个规格（SKU）'
  if (skus.some((row) => !(row.price > 0))) return '规格售价必须大于 0'
  if (skus.some((row) => row.stock !== undefined && row.stock < 0)) return '规格库存不能为负数'
  const groups = optionGroups.value.filter((group) => group.name.trim() !== '')
  if (groups.some((group) => group.options.filter((option) => option.name.trim() !== '').length === 0)) {
    return `加料组「${groups.find((group) => group.options.filter((option) => option.name.trim() !== '').length === 0)?.name ?? ''}」至少需要一个加料项`
  }
  if (form.stockType === 'fixed' && (form.stock === undefined || form.stock < 0)) return '请填写固定库存数量'
  return null
}

const saveMutation = useMutation({
  mutationFn: (payload: DishInput) =>
    props.dishId ? updateDish(props.dishId, payload) : createDish(payload),
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '菜品已更新' : '菜品已创建')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dishes })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dishDetail })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard })
    visible.value = false
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    const customError = validateCustomRows()
    if (customError) {
      ElMessage.warning(customError)
      return
    }
    if (!form.categoryId) {
      ElMessage.warning('请选择所属分类')
      return
    }
    const payload: DishInput = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      subtitle: form.subtitle.trim(),
      image: form.image.trim(),
      description: form.description.trim(),
      price: Number(form.price ?? 0),
      unit: form.unit,
      stockType: form.stockType,
      sort: Number(form.sort ?? 0),
      isRecommend: form.isRecommend,
      status: form.status,
      tags: form.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
      skus: buildSkus(),
      optionGroups: buildOptionGroups(),
    }
    if (form.memberPrice !== undefined && form.memberPrice !== null) payload.memberPrice = form.memberPrice
    if (form.stockType === 'fixed' && form.stock !== undefined) payload.stock = form.stock
    saveMutation.mutate(payload)
  })
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="drawerTitle"
    size="860px"
    :close-on-click-modal="false"
    direction="rtl"
  >
    <div v-loading="detailQuery.isFetching.value" class="dish-form">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-divider content-position="left">基础信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="菜品名称" prop="name">
              <el-input v-model="form.name" maxlength="40" show-word-limit placeholder="如：招牌牛肉面" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属分类" prop="categoryId">
              <el-select v-model="form.categoryId" placeholder="请选择分类" class="full-width">
                <el-option
                  v-for="item in categories"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                  :disabled="item.status === 'disabled'"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="副标题" prop="subtitle">
              <el-input v-model="form.subtitle" maxlength="40" placeholder="列表页第二行文案，可留空" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位" prop="unit">
              <el-select v-model="form.unit" filterable allow-create default-first-option placeholder="份">
                <el-option v-for="item in DISH_UNIT_PRESETS" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="售价" prop="price">
              <el-input-number v-model="form.price" :min="0" :precision="2" :step="1" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="会员价" prop="memberPrice">
              <el-input-number
                v-model="form.memberPrice"
                :min="0"
                :precision="2"
                :step="1"
                :value-on-clear="undefined"
                controls-position="right"
                placeholder="留空表示不设会员价"
              />
              <span class="form-tip">留空则不展示会员价</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="库存方式" prop="stockType">
              <el-radio-group v-model="form.stockType">
                <el-radio-button v-for="item in DISH_STOCK_TYPE_OPTIONS" :key="item.value" :value="item.value">
                  {{ item.label }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item v-if="form.stockType === 'fixed'" label="库存数量" prop="stock">
              <el-input-number v-model="form.stock" :min="0" :step="1" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序值" prop="sort">
              <el-input-number v-model="form.sort" :min="0" :max="9999" :step="1" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上架状态" prop="status">
              <el-radio-group v-model="form.status">
                <el-radio-button v-for="item in DISH_STATUS_OPTIONS" :key="item.value" :value="item.value">
                  {{ item.label }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="推荐位" prop="isRecommend">
              <el-switch v-model="form.isRecommend" active-text="首页推荐" inactive-text="不推荐" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="标签" prop="tags">
              <el-select
                v-model="form.tags"
                multiple
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                placeholder="选择或输入标签"
                class="full-width"
              >
                <el-option v-for="item in DISH_TAG_PRESETS" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="菜品图片" prop="image">
              <ImageUrlField v-model="form.image" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="菜品描述" prop="description">
              <el-input v-model="form.description" type="textarea" :rows="3" maxlength="300" show-word-limit />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">
          规格 SKU
          <el-button text type="primary" size="small" class="divider-action" @click="addSku">
            <el-icon><Plus /></el-icon>
            <span>添加规格</span>
          </el-button>
        </el-divider>
        <div class="row-list">
          <div v-for="(row, index) in skuRows" :key="index" class="row-list__item">
            <div class="row-list__fields">
              <el-input v-model="row.name" placeholder="规格名，如 大份" class="w-140" />
              <el-input-number
                v-model="row.price"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                class="w-130"
              />
              <el-input v-model="row.specDesc" placeholder="规格描述，如 200g" class="w-160" />
              <el-input-number
                v-model="row.stock"
                :min="0"
                :step="1"
                :value-on-clear="undefined"
                controls-position="right"
                placeholder="库存"
                class="w-130"
              />
              <el-input-number v-model="row.sort" :min="0" :step="1" controls-position="right" class="w-110" />
            </div>
            <el-button
              text
              type="danger"
              :disabled="skuRows.length <= 1"
              @click="removeSku(index)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <p class="row-list__hint text-muted">字段依次为：规格名 / 售价 / 规格描述 / 库存（留空不限） / 排序</p>
        </div>

        <el-divider content-position="left">
          加料组
          <el-button text type="primary" size="small" class="divider-action" @click="addOptionGroup">
            <el-icon><Plus /></el-icon>
            <span>添加加料组</span>
          </el-button>
        </el-divider>
        <div v-if="optionGroups.length > 0" class="group-list">
          <div v-for="(group, groupIndex) in optionGroups" :key="groupIndex" class="group-list__item">
            <div class="group-list__head">
              <el-input v-model="group.name" placeholder="组名，如 辣度" class="w-160" />
              <el-select v-model="group.type" class="w-110">
                <el-option
                  v-for="item in DISH_OPTION_TYPE_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-checkbox v-model="group.required">必选</el-checkbox>
              <el-input-number v-model="group.sort" :min="0" :step="1" controls-position="right" class="w-110" />
              <el-button text type="danger" @click="removeOptionGroup(groupIndex)">
                <el-icon><Delete /></el-icon>
                <span>删除组</span>
              </el-button>
            </div>
            <div v-for="(option, optionIndex) in group.options" :key="optionIndex" class="group-list__option">
              <el-input v-model="option.name" placeholder="加料项，如 加辣" class="w-160" />
              <el-input-number
                v-model="option.priceDelta"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                class="w-130"
              />
              <el-input-number v-model="option.sort" :min="0" :step="1" controls-position="right" class="w-110" />
              <el-button
                text
                type="danger"
                :disabled="group.options.length <= 1"
                @click="removeOption(group, optionIndex)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button text type="primary" size="small" @click="addOption(group)">
              <el-icon><Plus /></el-icon>
              <span>添加加料项</span>
            </el-button>
          </div>
        </div>
        <el-empty v-else description="暂无加料组，可按需添加" :image-size="60" />
      </el-form>
    </div>

    <template #footer>
      <el-space>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">
          {{ isEdit ? '保存修改' : '创建菜品' }}
        </el-button>
      </el-space>
    </template>
  </el-drawer>
</template>

<style scoped>
.dish-form {
  padding-right: 8px;
}

.full-width {
  width: 100%;
}

.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.divider-action {
  margin-left: 12px;
}

.row-list__item,
.group-list__option {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.row-list__fields {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
}

.row-list__hint {
  margin: 0;
  font-size: 12px;
}

.group-list__item {
  padding: 12px;
  margin-bottom: 12px;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 8px;
}

.group-list__head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.w-110 {
  width: 110px;
}

.w-130 {
  width: 130px;
}

.w-140 {
  width: 140px;
}

.w-160 {
  width: 160px;
}
</style>
