<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, type UploadRequestHandler } from 'element-plus'

import { uploadImage } from '@/api/upload'

/**
 * 图片录入：上传 或 填 URL 两种方式，值统一是字符串。
 *
 * 上传得到的相对地址（/uploads/...）与外链都直接存库；
 * 只有上传的那张会把文件落到服务器，外链不搬进本地，
 * 商户换图床、用已有 CDN 时不必重复占自己磁盘。
 */
const url = defineModel<string | null>({ default: '' })

const props = withDefaults(defineProps<{ tip?: string }>(), { tip: '' })

type Mode = 'upload' | 'url'

const MAX_MB = 5
const ACCEPTED: { ext: string; mime: string }[] = [
  { ext: 'jpg', mime: 'image/jpeg' },
  { ext: 'png', mime: 'image/png' },
  { ext: 'gif', mime: 'image/gif' },
  { ext: 'webp', mime: 'image/webp' },
]
const ACCEPT_ATTR = ACCEPTED.map((item) => item.mime).join(',')

const uploading = ref(false)
const mode = ref<Mode>('upload')

/** 已有值是外链时，打开就落在 URL 页签，免得商户以为图丢了；站内路径仍留在上传页签 */
watch(
  () => url.value,
  (value) => {
    if (value && /^https?:\/\//.test(value)) mode.value = 'url'
  },
  { immediate: true },
)

const trimmed = computed(() => (url.value ?? '').trim())

const handleUpload: UploadRequestHandler = async (options) => {
  const file = options.file as File
  const okType = ACCEPTED.some((item) => item.mime === file.type)
  if (!okType) {
    ElMessage.warning('只支持 jpg / png / gif / webp 图片')
    return
  }
  // 服务端同样会按文件真实字节再判一次，这里只是省掉一次无谓往返
  if (file.size > MAX_MB * 1024 * 1024) {
    ElMessage.warning(`图片不能超过 ${MAX_MB} MB`)
    return
  }

  uploading.value = true
  try {
    const uploaded = await uploadImage(file)
    url.value = uploaded.url
    ElMessage.success('图片已上传')
  } catch {
    // 失败原因已由请求层统一弹出
  } finally {
    uploading.value = false
  }
}

function clearImage(): void {
  url.value = ''
}
</script>

<template>
  <div class="image-field">
    <div class="image-field__head">
      <el-radio-group v-model="mode" size="small">
        <el-radio-button value="upload">上传图片</el-radio-button>
        <el-radio-button value="url">填图片地址</el-radio-button>
      </el-radio-group>
      <el-button
        v-if="trimmed"
        link
        type="danger"
        size="small"
        class="image-field__clear"
        @click="clearImage"
      >
        清除
      </el-button>
    </div>

    <el-upload
      v-if="mode === 'upload'"
      :show-file-list="false"
      :accept="ACCEPT_ATTR"
      :http-request="handleUpload"
      :disabled="uploading"
      drag
      class="image-field__upload"
    >
      <div v-if="uploading" class="image-field__drop image-field__drop--busy">上传中…</div>
      <div v-else-if="trimmed" class="image-field__drop">点击或拖拽以更换图片</div>
      <div v-else class="image-field__drop image-field__drop--empty">
        点击或拖拽图片到此处
        <span class="image-field__hint">jpg / png / gif / webp，不超过 {{ MAX_MB }}MB</span>
      </div>
    </el-upload>

    <el-input
      v-else
      v-model="url"
      clearable
      placeholder="https:// 开头的图片地址"
      @blur="url = (url ?? '').trim()"
    />

    <div v-if="tip" class="image-field__tip">{{ tip }}</div>

    <div class="image-field__preview">
      <el-image
        v-if="trimmed"
        :src="trimmed"
        fit="cover"
        :preview-src-list="[trimmed]"
        preview-teleported
        class="image-field__thumb"
      >
        <template #error>
          <div class="image-field__broken">图片加载失败</div>
        </template>
      </el-image>
      <div v-else class="image-field__empty">暂无图片</div>
    </div>
  </div>
</template>

<style scoped>
.image-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.image-field__head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.image-field__clear {
  margin-left: auto;
}

.image-field__upload :deep(.el-upload) {
  width: 100%;
}

.image-field__upload :deep(.el-upload-dragger) {
  padding: 14px 12px;
}

.image-field__drop {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.image-field__drop--empty {
  color: var(--el-text-color-secondary);
}

.image-field__drop--busy {
  color: var(--el-color-primary);
}

.image-field__hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.image-field__tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.image-field__thumb {
  width: 96px;
  height: 96px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.image-field__broken,
.image-field__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}
</style>
