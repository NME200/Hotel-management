/** 后端统一响应信封 */
export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  timestamp: number
  requestId: string
}

/** 分页响应 payload */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 分页请求通用 query */
export interface PageQuery {
  page?: number
  pageSize?: number
  keyword?: string
}
