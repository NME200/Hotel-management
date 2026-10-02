<script setup lang="ts">
/** 图片以 URL 形式录入（后端存储 URL），这里提供输入 + 预览 */
const url = defineModel<string | null>({ default: '' })
</script>

<template>
  <div class="image-url-field">
    <el-input
      v-model="url"
      clearable
      placeholder="https:// 开头的图片地址，可留空"
      @blur="url = (url ?? '').trim()"
    />
    <div class="image-url-field__preview">
      <el-image
        v-if="url"
        :src="url"
        fit="cover"
        :preview-src-list="[url]"
        preview-teleported
        class="image-url-field__thumb"
      >
        <template #error>
          <div class="image-url-field__broken">图片加载失败</div>
        </template>
      </el-image>
      <div v-else class="image-url-field__empty">暂无图片</div>
    </div>
  </div>
</template>

<style scoped>
.image-url-field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
}

.image-url-field :deep(.el-input) {
  flex: 1;
}

.image-url-field__preview {
  flex-shrink: 0;
}

.image-url-field__thumb {
  width: 72px;
  height: 72px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}

.image-url-field__broken,
.image-url-field__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}
</style>
