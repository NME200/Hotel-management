<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createPrinter, updatePrinter } from '@/api/print'
import { QUERY_KEYS } from '@/api/keys'
import type {
  PrintMode,
  PrintPaperSize,
  PrintProvider,
  PrinterItem,
  PrinterStatus,
  PrinterUpdateInput,
  PrintTicketType,
} from '@/api/types/print'
import {
  PRINT_MAX_COPIES,
  PRINT_MODE_OPTIONS,
  PRINT_PAPER_SIZE_OPTIONS,
  PRINT_PROVIDER_OPTIONS,
  PRINT_TICKET_TYPE_OPTIONS,
  PRINTER_STATUS_OPTIONS,
} from '@/constants/dictionary'
import { requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  /** 有值表示编辑，为空表示新增 */
  record: PrinterItem | null
}>()

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

interface PrinterForm {
  name: string
  mode: PrintMode
  ticketType: PrintTicketType
  paperSize: PrintPaperSize
  copies: number
  provider: PrintProvider | null
  deviceNo: string
  remark: string
  status: PrinterStatus
}

const form = reactive<PrinterForm>({
  name: '',
  mode: 'browser',
  ticketType: 'customer',
  paperSize: '80mm',
  copies: 1,
  provider: null,
  deviceNo: '',
  remark: '',
  status: 'active',
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑打印机' : '新增打印机'))
const isCloud = computed(() => form.mode === 'cloud')

const rules: FormRules<PrinterForm> = {
  name: [requiredRule('请输入打印机名称')],
  provider: [
    {
      validator: (_rule, _value, callback) => {
        if (form.mode === 'cloud' && !form.provider) {
          callback(new Error('云打印机需要选择厂商'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  deviceNo: [
    {
      validator: (_rule, _value, callback) => {
        if (form.mode === 'cloud' && !form.deviceNo.trim()) {
          callback(new Error('云打印机需要填写设备号'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        name: props.record.name,
        mode: props.record.mode,
        ticketType: props.record.ticketType,
        paperSize: props.record.paperSize,
        copies: props.record.copies,
        provider: props.record.provider,
        deviceNo: props.record.deviceNo ?? '',
        remark: props.record.remark ?? '',
        status: props.record.status,
      })
    } else {
      Object.assign(form, {
        name: '',
        mode: 'browser' as PrintMode,
        ticketType: 'customer' as PrintTicketType,
        paperSize: '80mm' as PrintPaperSize,
        copies: 1,
        provider: null,
        deviceNo: '',
        remark: '',
        status: 'active' as PrinterStatus,
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

/** 切回浏览器小票机时清掉云端凭据，避免表单上留着一个已失效的设备号 */
watch(
  () => form.mode,
  (mode) => {
    if (mode === 'browser') {
      form.provider = null
      form.deviceNo = ''
    }
  },
)

const saveMutation = useMutation({
  mutationFn: (payload: PrinterUpdateInput) =>
    props.record ? updatePrinter(props.record.id, payload) : createPrinter(payload),
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '打印机已更新' : '打印机已添加')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.printers })
    visible.value = false
    emit('saved')
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate({
      name: form.name.trim(),
      mode: form.mode,
      ticketType: form.ticketType,
      paperSize: form.paperSize,
      copies: form.copies,
      provider: isCloud.value ? form.provider : null,
      deviceNo: isCloud.value ? form.deviceNo.trim() : null,
      remark: form.remark.trim() || null,
      status: form.status,
    })
  })
}
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle" width="560px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
      <el-form-item label="打印机名称" prop="name">
        <el-input v-model="form.name" maxlength="64" placeholder="如：前台收银机" />
      </el-form-item>

      <el-form-item label="打印方式" prop="mode">
        <el-radio-group v-model="form.mode">
          <el-radio-button v-for="item in PRINT_MODE_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
        <p class="form-hint">
          {{
            isCloud
              ? '云打印机由服务端把任务推给厂商网关，断网也能补打'
              : '浏览器小票机接在收银电脑上，点打印即出纸，无需额外配置'
          }}
        </p>
      </el-form-item>

      <el-form-item label="负责票种" prop="ticketType">
        <el-radio-group v-model="form.ticketType">
          <el-radio-button
            v-for="item in PRINT_TICKET_TYPE_OPTIONS"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="纸张宽度" prop="paperSize">
        <el-select v-model="form.paperSize" style="width: 100%">
          <el-option
            v-for="item in PRINT_PAPER_SIZE_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="默认份数" prop="copies">
        <el-input-number v-model="form.copies" :min="1" :max="PRINT_MAX_COPIES" />
        <span class="form-hint form-hint--inline">单次最多 {{ PRINT_MAX_COPIES }} 份</span>
      </el-form-item>

      <template v-if="isCloud">
        <el-form-item label="厂商" prop="provider">
          <el-select v-model="form.provider" placeholder="选择云打印机厂商" style="width: 100%">
            <el-option
              v-for="item in PRINT_PROVIDER_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="设备号" prop="deviceNo">
          <el-input v-model="form.deviceNo" maxlength="64" placeholder="打印机机身 sn，厂商后台可查" />
          <p class="form-hint">
            买到打印机后，把机身标签上的设备号（sn）填在这里即可，无需再找平台开通；
            厂商密钥由平台统一配置。
          </p>
        </el-form-item>
      </template>

      <el-form-item v-if="isEdit" label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button
            v-for="item in PRINTER_STATUS_OPTIONS"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="255"
          show-word-limit
          placeholder="如：放在前台收银台"
        />
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
