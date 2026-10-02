<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Refresh, Search, Star } from '@element-plus/icons-vue'

import { fetchMerchantDishes } from '@/api/merchant-insight'
import { QUERY_KEYS } from '@/api/keys'
import type { DishStatus, PlatformDish, PlatformDishListParams } from '@/api/types/merchant-insight'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { DISH_STATUS_DICT, DISH_STATUS_OPTIONS, DISH_STOCK_TYPE_DICT, dictLabel, type DictOption } from '@/constants/dictionary'
import { formatMoney } from '@/utils/format'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'

const props = defineProps<{ merchantId: number }>()

const keyword = ref('')
const status = ref<DishStatus | undefined>(undefined)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const queryParams = computed<PlatformDishListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  status: status.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const dishQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantInsight, props.merchantId, 'dishes', queryParams.value]),
  queryFn: () => fetchMerchantDishes(props.merchantId, queryParams.value),
  enabled: computed(() => props.merchantId > 0),
  placeholderData: keepPreviousData,
})

const rows = computed<PlatformDish[]>(() => dishQuery.data.value?.list ?? [])
const total = computed(() => dishQuery.data.value?.total ?? 0)

/** 固定库存且剩余为 0 时单独标红，其余状态直接取字典 */
const SOLD_OUT_ITEM: DictOption = { value: 'sold_out', label: '已售罄', tag: 'danger' }

function isSoldOut(row: PlatformDish): boolean {
  return row.stockType === 'fixed' && (row.stock ?? 0) <= 0
}

function stockText(row: PlatformDish): string {
  if (row.stockType === 'unlimited') return dictLabel(DISH_STOCK_TYPE_DICT, row.stockType)
  return `剩余 ${row.stock ?? 0}`
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  status.value = undefined
  page.value = DEFAULT_PAGE
}
</script>

<template>
  <div class="dish-tab">
    <div class="dish-tab__toolbar">
      <el-space wrap :size="12">
        <el-input
          v-model="keyword"
          placeholder="菜品名称 / 副标题"
          clearable
          class="toolbar-input"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
          <el-option v-for="item in DISH_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-space>
      <el-button @click="dishQuery.refetch()">
        <el-icon><Refresh /></el-icon>
        <span>刷新</span>
      </el-button>
    </div>

    <el-table v-loading="dishQuery.isFetching.value" :data="rows" border stripe size="small">
      <el-table-column label="菜品" min-width="220">
        <template #default="{ row }: { row: PlatformDish }">
          <div class="cell-dish">
            <el-image v-if="row.image" :src="row.image" fit="cover" class="cell-dish__thumb">
              <template #error>
                <div class="cell-dish__thumb cell-dish__thumb--broken">图</div>
              </template>
            </el-image>
            <div v-else class="cell-dish__thumb cell-dish__thumb--broken">无图</div>
            <div class="cell-text">
              <span class="text-ellipsis">
                {{ row.name }}
                <el-tag v-if="row.isRecommend" size="small" type="danger" effect="plain">
                  <el-icon><Star /></el-icon>
                  推荐
                </el-tag>
              </span>
              <p class="table-sub-text">
                {{ row.categoryName }}
                <span v-if="row.subtitle"> · {{ row.subtitle }}</span>
              </p>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="价格" width="130" align="right">
        <template #default="{ row }: { row: PlatformDish }">
          <div class="cell-amount">
            <span>{{ formatMoney(row.price) }}</span>
            <p v-if="row.memberPrice !== null" class="table-sub-text">会员 {{ formatMoney(row.memberPrice) }}</p>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="库存" width="120" align="center">
        <template #default="{ row }: { row: PlatformDish }">
          <StatusTag v-if="isSoldOut(row)" :item="SOLD_OUT_ITEM" />
          <span v-else>{{ stockText(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="销量" width="90" align="center">
        <template #default="{ row }: { row: PlatformDish }">{{ row.salesCount }}</template>
      </el-table-column>
      <el-table-column label="排序" width="80" align="center">
        <template #default="{ row }: { row: PlatformDish }">{{ row.sort }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }: { row: PlatformDish }">
          <StatusTag :item="DISH_STATUS_DICT[row.status]" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }: { row: PlatformDish }"><TimeText :value="row.createdAt" mode="date" /></template>
      </el-table-column>
      <template #empty>
        <el-empty
          :description="dishQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '该商户暂无菜品'"
          :image-size="60"
        />
      </template>
    </el-table>

    <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </div>
</template>

<style scoped>
.dish-tab {
  display: flex;
  flex-direction: column;
}

.dish-tab__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-input {
  width: 180px;
}

.toolbar-select {
  width: 120px;
}

.cell-dish {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-dish__thumb {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 6px;
}

.cell-dish__thumb--broken {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #c0c4cc;
  background: #f4f6fa;
  border: 1px dashed #dcdfe6;
}

.cell-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
</style>
