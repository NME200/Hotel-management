<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createCategory, updateCategory } from '@/api/category'
import { QUERY_KEYS } from '@/api/keys'
import type { Category, CategoryInput, CategoryStatus } from '@/api/types/category'
import { CATEGORY_STATUS_OPTIONS } from '@/constants/dictionary'
import { nameRule, requiredRule } from '@/utils/validate'
import ImageUrlField from '@/components/common/ImageUrlField.vue'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  /** 有值表示编辑，为空表示新增 */
  record: Category | null
}>()

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive<CategoryInput & { image: string }>({
  name: '',
  sort: 0,
  status: 'enabled',
  image: '',
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑分类' : '新增分类'))

const rules: FormRules<typeof form> = {
  name: [requiredRule('请输入分类名称'), nameRule],
  status: [requiredRule('请选择分类状态')],
}

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        name: props.record.name,
        sort: props.record.sort,
        status: props.record.status,
        image: props.record.image ?? '',
      })
    } else {
      Object.assign(form, { name: '', sort: 0, status: 'enabled' as CategoryStatus, image: '' })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: (payload: CategoryInput) =>
    props.record ? updateCategory(props.record.id, payload) : createCategory(payload),
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '分类已更新' : '分类已创建')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dishes })
    visible.value = false
    emit('saved')
  },
})

function buildPayload(): CategoryInput {
  const payload: CategoryInput = {
    name: form.name.trim(),
    sort: Number(form.sort ?? 0),
    status: form.status,
  }
  const image = form.image.trim()
  if (image) payload.image = image
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
  <el-dialog v-model="visible" :title="dialogTitle" width="480px" :close-on-click-modal="false">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
      <el-form-item label="分类名称" prop="name">
        <el-input v-model="form.name" maxlength="30" show-word-limit placeholder="如：招牌热菜" />
      </el-form-item>
      <el-form-item label="排序值" prop="sort">
        <el-input-number v-model="form.sort" :min="0" :max="9999" :step="1" controls-position="right" />
        <span class="form-tip">数值越小越靠前</span>
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button v-for="item in CATEGORY_STATUS_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="分类图片" prop="image">
        <ImageUrlField v-model="form.image" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
</style>
