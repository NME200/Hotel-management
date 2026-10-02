import { http } from './request'
import type {
  MiniProgramConfigUpdateInput,
  MiniProgramConfigView,
  MiniProgramConnectivityResult,
} from './types/mini-program'

/** GET /platform/mini-program-config 读取配置（AppSecret 只回掩码与指纹） */
export function fetchMiniProgramConfig(): Promise<MiniProgramConfigView> {
  return http.get<MiniProgramConfigView>('/platform/mini-program-config')
}

/**
 * PUT /platform/mini-program-config 保存配置。
 * input.appSecret 为 undefined 表示不改动密钥，空串表示清空，其余值表示覆盖。
 */
export function updateMiniProgramConfig(
  input: MiniProgramConfigUpdateInput,
): Promise<MiniProgramConfigView> {
  return http.put<MiniProgramConfigView>('/platform/mini-program-config', input)
}

/** POST /platform/mini-program-config/test 连通性自检（读的是已保存配置，不是页面草稿） */
export function testMiniProgramConfig(): Promise<MiniProgramConnectivityResult> {
  return http.post<MiniProgramConnectivityResult>('/platform/mini-program-config/test')
}
