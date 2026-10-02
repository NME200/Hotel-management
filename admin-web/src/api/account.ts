import { http } from './request'
import type { AccountCreateInput, AccountListParams, AccountUpdateInput, PlatformAccount } from './types/account'
import type { PageResult } from './types/common'

/** GET /platform/accounts */
export function fetchAccounts(params: AccountListParams): Promise<PageResult<PlatformAccount>> {
  return http.get<PageResult<PlatformAccount>>('/platform/accounts', { ...params })
}

/** POST /platform/accounts */
export function createAccount(input: AccountCreateInput): Promise<PlatformAccount> {
  return http.post<PlatformAccount>('/platform/accounts', input)
}

/** PATCH /platform/accounts/{id}，input 带 password 即为重置密码 */
export function updateAccount(id: number, input: AccountUpdateInput): Promise<PlatformAccount> {
  return http.patch<PlatformAccount>(`/platform/accounts/${id}`, input)
}
