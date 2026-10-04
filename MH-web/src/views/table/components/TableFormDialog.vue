<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createTable, updateTable } from '@/api/table'
import { QUERY_KEYS } from '@/api/keys'
import type { TableItem, TableStatus, TableUpdateInput } from '@/api/types/table'
import { TABLE_STATUS_OPTIONS } from '@/constants/dictionary'
import { requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  /** 有值表示编辑，为空表示新增 */
  record: TableItem | null
}>()

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

interface TableForm {
  tableNo: string
  area: string
  seats: number | null
  sort: number
  status: TableStatus
}

const form = reactive<TableForm>({
  tableNo: '',
  area: '',
  seats: null,
  sort: 0,
  status: 'active',
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑桌位' : '新增桌位'))

const rules: FormRules<TableForm> = {
  tableNo: [requiredRule('请输入桌号')],
}

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        tableNo: props.record.tableNo,
        area: props.record.area ?? '',
        seats: props.record.seats,
        sort: props.record.sort,
        status: props.record.status,
      })
    } else {
      Object.assign(form, {
        tableNo: '',
        area: '',
        seats: null,
        sort: 0,
        status: 'active' as TableStatus,
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: (payload: TableUpdateInput) =>
    props.record ? updateTable(props.record.id, payload) : createTable(payload),
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '桌位已更新' : '桌位已添加')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
    visible.value = false
    emit('saved')
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate({
      tableNo: form.tableNo.trim(),
      area: form.area.trim() || null,
      seats: form.seats,
      sort: form.sort,
      status: form.status,
    })
  })
}
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle" width="520px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="桌号" prop="tableNo">
        <el-input v-model="form.tableNo" maxlength="32" placeholder="如：A01 / 8号桌" />
        <p class="form-hint">
          {{
            isEdit
              ? '改桌号不会影响已经贴出去的二维码 —— 码里存的是桌位凭据，不是桌号本身。'
              : '顾客扫这张桌的二维码后，订单会自动带上这个桌号。'
          }}
        </p>
      </el-form-item>

      <el-form-item label="区域" prop="area">
        <el-input v-model="form.area" maxlength="32" placeholder="如：一楼大厅（可不填）" />
      </el-form-item>

      <el-form-item label="座位数" prop="seats">
        <el-input-number v-model="form.seats" :min="1" :max="99" placeholder="可不填" />
        <span class="form-hint form-hint--inline">仅作提示，不影响下单</span>
      </el-form-item>

      <el-form-item label="排序" prop="sort">
        <el-input-number v-model="form.sort" :min="0" :max="9999" />
        <span class="form-hint form-hint--inline">数字越小越靠前</span>
      </el-form-item>

      <el-form-item v-if="isEdit" label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button
            v-for="item in TABLE_STATUS_OPTIONS"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
        <p class="form-hint">停用后顾客扫这张桌的码会提示桌位不可用，不影响其他桌。</p>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}

.form-hint--inline {
  margin: 0 0 0 8px;
}
</style>
