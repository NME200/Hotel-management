<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'

import { deleteCategory, fetchCategories } from '@/api/category'
import { QUERY_KEYS } from '@/api/keys'
import type { Category, CategoryListParams } from '@/api/types/category'
import { CATEGORY_STATUS_DICT } from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import CategoryFormDialog from './components/CategoryFormDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const dialogVisible = ref(false)
const editingCategory = ref<Category | null>(null)

const queryParams = computed<CategoryListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  page: page.value,
  pageSize: pageSize.value,
}))

const categoryQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.categories, 'list', queryParams.value]),
  queryFn: () => fetchCategories(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.categoryRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<Category[]>(() => categoryQuery.data.value?.list ?? [])
const total = computed(() => categoryQuery.data.value?.total ?? 0)

const statusItem = (row: Category) => CATEGORY_STATUS_DICT[row.status]

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  page.value = DEFAULT_PAGE
}

function openCreate(): void {
  editingCategory.value = null
  dialogVisible.value = true
}

function openEdit(row: Category): void {
  editingCategory.value = row
  dialogVisible.value = true
}

async function handleDelete(row: Category): Promise<void> {
  try {
    await ElMessageBox.confirm(
      row.dishCount > 0
        ? `分类「${row.name}」下仍有 ${row.dishCount} 个菜品，删除后需要重新归类，确认删除？`
        : `确认删除分类「${row.name}」？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteCategory(row.id)
    ElMessage.success('分类已删除')
    if (rows.value.length === 1 && page.value > DEFAULT_PAGE) page.value -= 1
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories })
  } catch {
    // 错误提示已由请求层统一处理
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-model="keyword"
            placeholder="搜索分类名称"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="categoryQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.categoryCreate)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>新增分类</span>
          </el-button>
        </el-space>
      </div>

      <el-table v-loading="categoryQuery.isFetching.value" :data="rows" border stripe class="category-table">
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="分类" min-width="220">
          <template #default="{ row }: { row: Category }">
            <div class="cell-name">
              <el-image
                v-if="row.image"
                :src="row.image"
                fit="cover"
                class="cell-thumb"
                :preview-src-list="[row.image]"
                preview-teleported
              >
                <template #error>
                  <div class="cell-thumb cell-thumb--broken">图</div>
                </template>
              </el-image>
              <div v-else class="cell-thumb cell-thumb--empty">无图</div>
              <div class="cell-text">
                <span class="text-ellipsis">{{ row.name }}</span>
                <p class="table-sub-text">ID：{{ row.id }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="菜品数" width="100" align="center">
          <template #default="{ row }: { row: Category }">{{ row.dishCount }} 个</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: Category }">
            <StatusTag :item="statusItem(row)" />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }: { row: Category }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right" align="right">
          <template #default="{ row }: { row: Category }">
            <el-button v-if="authStore.can(PERMISSION.categoryUpdate)" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button v-if="authStore.can(PERMISSION.categoryDelete)" text type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="categoryQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无分类'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <CategoryFormDialog v-model="dialogVisible" :record="editingCategory" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 220px;
}

.category-table {
  padding: 0 16px;
}

.cell-name {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 6px;
}

.cell-thumb--broken,
.cell-thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #909399;
  background: #f4f6fa;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
}

.cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
