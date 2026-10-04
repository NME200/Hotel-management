import { http } from './request'
import type {
  PrintProvider,
  PrintProviderItem,
  PrintProviderTestResult,
  PrintProviderUpdateInput,
} from './types/print-provider'

/** GET /platform/print-providers 飞鹅、易联云两条厂商配置 */
export function fetchPrintProviders(): Promise<PrintProviderItem[]> {
  return http.get<PrintProviderItem[]>('/platform/print-providers')
}

/** PUT /platform/print-providers/{provider} 保存厂商账号、密钥与总开关 */
export function updatePrintProvider(
  provider: PrintProvider,
  input: PrintProviderUpdateInput,
): Promise<PrintProviderItem> {
  return http.put<PrintProviderItem>(`/platform/print-providers/${provider}`, input)
}

/** POST /platform/print-providers/{provider}/test 厂商凭据自检 */
export function testPrintProvider(provider: PrintProvider): Promise<PrintProviderTestResult> {
  return http.post<PrintProviderTestResult>(`/platform/print-providers/${provider}/test`)
}
