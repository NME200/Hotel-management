<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Dish as DishIcon, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'

import { fetchCategories } from '@/api/category'
import { deleteDish, fetchDishes, updateDishStatus } from '@/api/dish'
import { QUERY_KEYS } from '@/api/keys'
import type { Category } from '@/api/types/category'
import type { DishBrief, DishListParams, DishStatus } from '@/api/types/dish'
import { DISH_STATUS_DICT, DISH_STATUS_OPTIONS } from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import DishFormDrawer from './components/DishFormDrawer.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const categoryId = ref<number | undefined>(undefined)
const status = ref<DishStatus | undefined>(undefined)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const drawerVisible = ref(false)
const editingDishId = ref<number | null>(null)

const queryParams = computed<DishListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  categoryId: categoryId.value,
  status: status.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const categoryQuery = useQuery({
  queryKey: [...QUERY_KEYS.categories, 'options'],
  queryFn: () => fetchCategories({ page: 1, pageSize: 100 }),
  enabled: computed(() => authStore.can(PERMISSION.categoryRead) || authStore.can(PERMISSION.dishRead)),
  staleTime: 300_000,
})

const categories = computed<Category[]>(() => categoryQuery.data.value?.list ?? [])

const dishQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.dishes, 'list', queryParams.value]),
  queryFn: () => fetchDishes(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.dishRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<DishBrief[]>(() => dishQuery.data.value?.list ?? [])
const total = computed(() => dishQuery.data.value?.total ?? 0)

const statusItem = (row: DishBrief) => DISH_STATUS_DICT[row.status]

const toggleMutation = useMutation({
  mutationFn: (variables: { id: number; status: DishStatus }) => updateDishStatus(variables.id, variables.status),
  onSuccess: (_data, variables) => {
    ElMessage.success(variables.status === 'on_sale' ? '菜品已上架' : '菜品已停售')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dishes })
  },
})

/** 列表页快捷上下架：切换失败时表格数据会随请求层错误提示保持原值 */
function handleToggle(row: DishBrief, next: DishStatus): void {
  if (!authStore.can(PERMISSION.dishToggle)) {
    ElMessage.warning('没有上下架权限')
    return
  }
  toggleMutation.mutate({ id: row.id, status: next })
}

async function handleDelete(row: DishBrief): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除菜品「${row.name}」？删除后历史订单不受影响。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteDish(row.id)
    ElMessage.success('菜品已删除')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dishes })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard })
  } catch {
    // 错误提示已由请求层统一处理
  }
}

function openCreate(): void {
  editingDishId.value = null
  drawerVisible.value = true
}

function openEdit(row: DishBrief): void {
  editingDishId.value = row.id
  drawerVisible.value = true
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  categoryId.value = undefined
  status.value = undefined
  page.value = DEFAULT_PAGE
}
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-model="keyword"
            placeholder="搜索菜品名称"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="categoryId" placeholder="全部分类" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in DISH_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="dishQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.dishCreate)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>新增菜品</span>
          </el-button>
        </el-space>
      </div>

      <el-table v-loading="dishQuery.isFetching.value" :data="rows" border stripe class="dish-table">
        <el-table-column label="菜品" min-width="240">
          <template #default="{ row }: { row: DishBrief }">
            <div class="cell-dish">
              <el-image v-if="row.image" :src="row.image" fit="cover" class="cell-thumb">
                <template #error>
                  <div class="cell-thumb cell-thumb--broken"><el-icon><DishIcon /></el-icon></div>
                </template>
              </el-image>
              <div v-else class="cell-thumb cell-thumb--broken"><el-icon><DishIcon /></el-icon></div>
              <div class="cell-text">
                <span class="cell-name text-ellipsis">{{ row.name }}</span>
                <p class="table-sub-text text-ellipsis">{{ row.subtitle || '—' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120">
          <template #default="{ row }: { row: DishBrief }">{{ row.categoryName }}</template>
        </el-table-column>
        <el-table-column label="价格" width="150" align="right">
          <template #default="{ row }: { row: DishBrief }">
            <div class="cell-price">
              <span>{{ formatMoney(row.price) }}</span>
              <p v-if="row.memberPrice !== null" class="table-sub-text">会员 {{ formatMoney(row.memberPrice) }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="库存" width="110" align="center">
          <template #default="{ row }: { row: DishBrief }">
            <span v-if="row.stockType === 'unlimited'" class="text-muted">不限</span>
            <span v-else>剩余 {{ row.stock ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="销量" width="90" align="center">
          <template #default="{ row }: { row: DishBrief }">{{ row.salesCount }}</template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="状态" width="140" align="center">
          <template #default="{ row }: { row: DishBrief }">
            <div class="cell-status">
              <StatusTag :item="statusItem(row)" />
              <el-switch
                :model-value="row.status === 'on_sale'"
                size="small"
                :disabled="!authStore.can(PERMISSION.dishToggle) || toggleMutation.isPending.value"
                @update:model-value="(value: boolean) => handleToggle(row, value ? 'on_sale' : 'off_sale')"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }: { row: DishBrief }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right" align="right">
          <template #default="{ row }: { row: DishBrief }">
            <el-button v-if="authStore.can(PERMISSION.dishUpdate)" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button v-if="authStore.can(PERMISSION.dishDelete)" text type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="dishQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无菜品'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <DishFormDrawer v-model="drawerVisible" :dish-id="editingDishId" :categories="categories" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 200px;
}

.toolbar-select {
  width: 150px;
}

.dish-table {
  padding: 0 16px;
}

.cell-dish {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-thumb {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 6px;
}

.cell-thumb--broken {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  background: #f4f6fa;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
}

.cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cell-name {
  font-weight: 500;
}

.cell-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.cell-status {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}
</style>
