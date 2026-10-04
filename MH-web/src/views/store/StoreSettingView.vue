<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { CirclePlus, Delete, Plus } from '@element-plus/icons-vue'

import { fetchStore, updateStore } from '@/api/store'
import { QUERY_KEYS } from '@/api/keys'
import type { StoreInfo, StoreStatus, StoreUpdateInput } from '@/api/types/store'
import { STORE_STATUS_OPTIONS } from '@/constants/dictionary'
import { AUTO_PRINT_ON_OPTIONS, PRINT_MAX_COPIES } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { requiredRule, telephoneRule } from '@/utils/validate'
import { useAuthStore } from '@/stores/auth'
import ImageUrlField from '@/components/common/ImageUrlField.vue'

interface HourRow {
  start: string
  end: string
}

/** 表单模型：文本字段统一用空串承载，坐标允许 null，提交时直接兼容 StoreUpdateInput */
interface StoreForm {
  name: string
  logo: string
  province: string
  city: string
  district: string
  address: string
  longitude: number | null
  latitude: number | null
  phone: string
  notice: string
  businessHours: string[]
  status: StoreStatus
  autoPrint: boolean
  autoPrintOn: 'accepted' | 'ready'
  customerCopies: number
}

const queryClient = useQueryClient()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const hourRows = ref<HourRow[]>([])

const canEdit = computed(() => authStore.can(PERMISSION.storeUpdate))

const storeQuery = useQuery({
  queryKey: QUERY_KEYS.store,
  queryFn: () => fetchStore(),
  enabled: computed(() => authStore.can(PERMISSION.storeRead)),
})

const form = reactive<StoreForm>({
  name: '',
  logo: '',
  province: '',
  city: '',
  district: '',
  address: '',
  longitude: null,
  latitude: null,
  phone: '',
  notice: '',
  businessHours: [],
  status: 'open',
  autoPrint: false,
  autoPrintOn: 'accepted',
  customerCopies: 1,
})

const rules: FormRules<StoreForm> = {
  name: [requiredRule('请输入门店名称')],
  phone: [requiredRule('请输入联系电话'), telephoneRule],
  address: [requiredRule('请输入详细地址')],
  businessHours: [
    {
      validator: (_rule, _value, callback) => {
        if (hourRows.value.length === 0) {
          callback(new Error('请至少设置一个营业时段'))
          return
        }
        const invalid = hourRows.value.some((row) => !row.start || !row.end || row.start >= row.end)
        if (invalid) {
          callback(new Error('营业时段的开始时间必须早于结束时间'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function parseHours(list: string[]): HourRow[] {
  return list.map((item) => {
    const [start = '', end = ''] = item.split('-')
    return { start, end }
  })
}

function serializeHours(rows: HourRow[]): string[] {
  return rows.filter((row) => row.start && row.end).map((row) => `${row.start}-${row.end}`)
}

function applyStore(data: StoreInfo): void {
  Object.assign(form, {
    name: data.name,
    logo: data.logo ?? '',
    province: data.province ?? '',
    city: data.city ?? '',
    district: data.district ?? '',
    address: data.address ?? '',
    longitude: data.longitude,
    latitude: data.latitude,
    phone: data.phone ?? '',
    notice: data.notice ?? '',
    businessHours: data.businessHours,
    status: data.status,
    autoPrint: data.autoPrint,
    autoPrintOn: data.autoPrintOn,
    customerCopies: data.customerCopies,
  })
}

watch(
  () => storeQuery.data.value,
  (data) => {
    if (!data) return
    applyStore(data)
    hourRows.value = parseHours(data.businessHours ?? [])
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: (payload: StoreUpdateInput) => updateStore(payload),
  onSuccess: () => {
    ElMessage.success('门店信息已保存')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.store })
  },
})

function addHourRow(): void {
  hourRows.value.push({ start: '10:00', end: '21:00' })
}

function removeHourRow(index: number): void {
  hourRows.value.splice(index, 1)
}

function buildPayload(): StoreUpdateInput {
  return {
    ...form,
    businessHours: serializeHours(hourRows.value),
  }
}

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate(buildPayload())
  })
}

function handleReset(): void {
  const data = storeQuery.data.value
  if (!data) return
  applyStore(data)
  hourRows.value = parseHours(data.businessHours ?? [])
  formRef.value?.clearValidate()
}

onMounted(() => {
  if (hourRows.value.length === 0 && !storeQuery.data.value) {
    hourRows.value = [{ start: '10:00', end: '21:00' }]
  }
})
</script>

<template>
  <el-card class="page-card" shadow="never" v-loading="storeQuery.isPending.value">
    <template #header>
      <div class="panel__header">
        <span>门店信息</span>
        <el-space size="small">
          <el-tag v-if="storeQuery.data.value" :type="storeQuery.data.value.status === 'open' ? 'success' : 'info'" size="small">
            {{ storeQuery.data.value.status === 'open' ? '营业中' : '休息中' }}
          </el-tag>
          <span class="text-muted">门店 ID：{{ storeQuery.data.value?.id ?? '--' }}</span>
        </el-space>
      </div>
    </template>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="110px"
      :disabled="!canEdit"
      class="store-form"
    >
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-form-item label="门店名称" prop="name">
            <el-input v-model="form.name" maxlength="40" show-word-limit placeholder="用于顾客端展示" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="联系电话" prop="phone">
            <el-input v-model="form.phone" maxlength="11" placeholder="11 位手机号或座机号" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="所在省份" prop="province">
            <el-input v-model="form.province" maxlength="30" placeholder="如：浙江省" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="城市" prop="city">
            <el-input v-model="form.city" maxlength="30" placeholder="如：杭州市" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="区县" prop="district">
            <el-input v-model="form.district" maxlength="30" placeholder="如：西湖区" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="详细地址" prop="address">
            <el-input v-model="form.address" maxlength="120" placeholder="街道、门牌号" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="经度" prop="longitude">
            <el-input-number
              v-model="form.longitude"
              :controls="false"
              :precision="7"
              placeholder="可留空，如 120.1550700"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="纬度" prop="latitude">
            <el-input-number
              v-model="form.latitude"
              :controls="false"
              :precision="7"
              placeholder="可留空，如 30.2740840"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="24">
          <el-form-item label="门店 Logo" prop="logo">
            <ImageUrlField v-model="form.logo" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="24">
          <el-form-item label="门店公告" prop="notice">
            <el-input
              v-model="form.notice"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="顾客下单前可见的公告信息"
            />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="营业状态" prop="status">
            <el-radio-group v-model="form.status">
              <el-radio-button v-for="item in STORE_STATUS_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="24">
          <el-form-item label="营业时段" prop="businessHours">
            <div class="hour-list">
              <div v-for="(row, index) in hourRows" :key="index" class="hour-list__row">
                <el-time-select
                  v-model="row.start"
                  start="00:00"
                  end="23:45"
                  step="00:15"
                  placeholder="开始"
                  class="hour-list__time"
                />
                <span class="hour-list__sep">至</span>
                <el-time-select
                  v-model="row.end"
                  start="00:00"
                  end="23:45"
                  step="00:15"
                  placeholder="结束"
                  class="hour-list__time"
                />
                <el-button text type="danger" :disabled="hourRows.length <= 1" @click="removeHourRow(index)">
                  <el-icon><Delete /></el-icon>
                  <span>删除</span>
                </el-button>
              </div>
              <el-button plain @click="addHourRow">
                <el-icon><Plus /></el-icon>
                <span>新增营业时段</span>
              </el-button>
            </div>
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider content-position="left">
        <span class="store-form__section">小票打印</span>
      </el-divider>

      <el-alert
        class="store-form__section-tip"
        type="info"
        :closable="false"
        show-icon
        title="这里只控制「什么时候自动打、打几张」。具体用哪台打印机，去「打印设置」里配。"
      />

      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-form-item label="自动打印">
            <el-switch v-model="form.autoPrint" />
            <span class="store-form__hint">开启后在订单流转到下面选定的时机时自动出票</span>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="打印时机">
            <el-select v-model="form.autoPrintOn" :disabled="!form.autoPrint" style="width: 100%">
              <el-option
                v-for="item in AUTO_PRINT_ON_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item label="顾客小票份数">
            <el-input-number
              v-model="form.customerCopies"
              :min="1"
              :max="PRINT_MAX_COPIES"
              style="width: 100%"
            />
            <span class="store-form__hint">默认 {{ PRINT_MAX_COPIES }} 份上限</span>
          </el-form-item>
        </el-col>
      </el-row>

      <div class="store-form__footer">
        <el-space>
          <el-button :disabled="!canEdit" @click="handleReset">重置</el-button>
          <el-button
            type="primary"
            :disabled="!canEdit"
            :loading="saveMutation.isPending.value"
            @click="handleSubmit"
          >
            <el-icon><CirclePlus /></el-icon>
            <span>保存设置</span>
          </el-button>
        </el-space>
      </div>
    </el-form>

    <el-alert
      v-if="!canEdit"
      class="store-form__tip"
      type="info"
      :closable="false"
      show-icon
      title="当前账号只有查看权限，如需修改请联系商家管理员开通 store:update 权限"
    />
  </el-card>
</template>

<style scoped>
.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
}

.store-form {
  max-width: 1080px;
}

.store-form__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

.store-form__tip {
  margin-top: 12px;
}

.store-form__section {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.store-form__section-tip {
  margin-bottom: 16px;
}

.store-form__hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.hour-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
}

.hour-list__row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.hour-list__time {
  width: 130px;
}

.hour-list__sep {
  color: #909399;
}
</style>
