import { http } from './request'

/** 后端落盘后返回的结果；url 是相对地址，直接回填表单存库。 */
export interface UploadedImage {
  url: string
  size: number
  mime: string
}

/** POST /merchant/uploads —— 字段名固定 file，后端按文件真实字节判类型 */
export function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  // 实例默认是 application/json，这里必须覆盖，否则后端收不到 multipart 边界
  return http.post<UploadedImage>('/merchant/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
  })
}
