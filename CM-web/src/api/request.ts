import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'

import type { TokenResult } from './types/auth'
import type { ApiEnvelope } from './types/common'
import { API_BASE_URL, REQUEST_TIMEOUT } from '@/constants/api'
import { accessTokenStorage, clearAuthStorage, refreshTokenStorage, saveTokens } from '@/utils/auth-storage'

declare module 'axios' {
  interface AxiosRequestConfig<D = any> {
    /** 登录 / 刷新等接口不需要携带 Authorization */
    skipAuth?: boolean
    /** 静默模式：错误不在全局弹提示，由调用方自行处理 */
    silent?: boolean
  }
}

/** 业务失败（HTTP 200 但 code !== 0）与 HTTP 错误统一成这一个错误类型 */
export class ApiError extends Error {
  readonly code: number
  readonly status: number | null
  readonly requestId: string

  constructor(message: string, code: number, status: number | null, requestId = '') {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
  }
}

/**
 * 这些接口自身返回 401 属于业务失败（账号密码错误等），不触发续期与登出。
 * 注意是收银台自己的登录入口：它被拒时不能把已有的会话一起清掉。
 */
const AUTH_ENDPOINTS = ['/auth/cashier/login', '/auth/refresh']

const HTTP_STATUS_MESSAGE: Record<number, string> = {
  400: '请求参数有误',
  401: '登录状态已失效，请重新登录',
  403: '没有该操作的权限',
  404: '请求的资源不存在',
  409: '数据已被他人修改，请刷新后重试',
  422: '提交的数据未通过校验',
  429: '操作过于频繁，请稍后重试',
  500: '服务异常，请稍后重试',
  502: '服务不可用，请确认后端服务已启动',
  503: '服务暂不可用，请稍后重试',
  504: '请求超时，请稍后重试',
}

const service: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
})

/* --------------------------- 登录态失效回调 --------------------------- */

let unauthorizedHandler: (() => void) | null = null
let loggingOut = false

/** 由 main.ts 注册：清理 Pinia 状态并跳转登录页，避免此处 import router 造成循环依赖 */
export function registerUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler
}

function handleUnauthorized(): void {
  clearAuthStorage()
  if (loggingOut) return
  loggingOut = true
  ElMessage.error('登录状态已失效，请重新登录')
  unauthorizedHandler?.()
  window.setTimeout(() => {
    loggingOut = false
  }, 1000)
}

/* ------------------------------ 请求拦截 ------------------------------ */

service.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.skipAuth) {
    const token = accessTokenStorage.value
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/* ------------------------------ 响应拦截 ------------------------------ */

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false
  return AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint))
}

function toApiError(error: AxiosError<ApiEnvelope<unknown>>): ApiError {
  const status = error.response?.status ?? null
  const body = error.response?.data
  const bodyMessage = body && typeof body.message === 'string' ? body.message : ''
  const fallback = status !== null ? (HTTP_STATUS_MESSAGE[status] ?? '网络异常，请稍后重试') : '网络异常，请稍后重试'
  const message = bodyMessage || fallback
  return new ApiError(message, body?.code ?? (status ?? -1), status, body?.requestId ?? '')
}

/** 拆开统一响应体：成功时把 response.data 替换为 envelope 的 data 字段 */
function unwrapEnvelope(response: AxiosResponse<unknown>): AxiosResponse<unknown> {
  const body = response.data as ApiEnvelope<unknown> | undefined
  if (!body || typeof body !== 'object' || typeof body.code !== 'number') return response
  if (body.code === 0) {
    response.data = body.data ?? null
    return response
  }
  throw new ApiError(body.message || '请求失败', body.code, response.status, body.requestId ?? '')
}

/* --------------------------- 并发安全的续期 --------------------------- */

let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise
  const current = refreshTokenStorage.value
  if (!current) return Promise.reject(new ApiError('登录状态已失效，请重新登录', 401, 401))

  refreshPromise = axios
    .post<ApiEnvelope<TokenResult>>(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken: current },
      { timeout: REQUEST_TIMEOUT },
    )
    .then((response) => {
      const session = response.data.data
      if (!session || !session.accessToken) throw new ApiError('登录状态续期失败', -1, null)
      saveTokens(session.accessToken, session.refreshToken)
      return session.accessToken
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

const retriedRequests = new WeakSet<object>()

service.interceptors.response.use(
  unwrapEnvelope,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const config = error.config
    const status = error.response?.status ?? null

    // 401：用 refreshToken 静默续期后重放原请求，并发时共享同一个刷新 Promise
    if (status === 401 && config && !config.skipAuth && !isAuthEndpoint(config.url) && !retriedRequests.has(config)) {
      retriedRequests.add(config)
      try {
        const token = await refreshAccessToken()
        config.headers.Authorization = `Bearer ${token}`
        return await service.request(config)
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 401) {
          handleUnauthorized()
          return Promise.reject(refreshError)
        }
        handleUnauthorized()
        return Promise.reject(toApiError(error))
      }
    }

    const apiError = toApiError(error)
    if (!config?.silent) ElMessage.error(apiError.message)
    return Promise.reject(apiError)
  },
)

/* ------------------------------ 类型化封装 ------------------------------ */

function payload<T>(response: AxiosResponse<T>): T {
  return response.data
}

export const http = {
  get<T>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<T> {
    return service.get<T>(url, { ...config, params }).then(payload<T>)
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return service.post<T>(url, data, config).then(payload<T>)
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return service.put<T>(url, data, config).then(payload<T>)
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return service.patch<T>(url, data, config).then(payload<T>)
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return service.delete<T>(url, config).then(payload<T>)
  },
}
