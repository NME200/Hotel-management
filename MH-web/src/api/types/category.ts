import type { PageQuery } from './common'

export type CategoryStatus = 'enabled' | 'disabled'

export interface Category {
  id: number
  merchantId: number
  name: string
  sort: number
  status: CategoryStatus
  image: string | null
  dishCount: number
  createdAt: string
}

export interface CategoryInput {
  name: string
  sort?: number
  status?: CategoryStatus
  image?: string
}

export interface CategoryListParams extends PageQuery {
  keyword?: string
}
