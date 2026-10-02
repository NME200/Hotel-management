import type { PageQuery } from './common'

export type DishStatus = 'on_sale' | 'off_sale'

export type DishStockType = 'unlimited' | 'fixed'

export type DishOptionType = 'single' | 'multi'

export interface DishBrief {
  id: number
  categoryId: number
  categoryName: string
  name: string
  subtitle: string
  image: string
  price: number
  memberPrice: number | null
  status: DishStatus
  salesCount: number
  stockType: DishStockType
  stock: number | null
  sort: number
  createdAt: string
}

export interface DishSku {
  id?: number
  name: string
  price: number
  specDesc: string
  stock: number | null
  sort: number
}

export interface DishOptionItem {
  id?: number
  name: string
  priceDelta: number
  sort: number
}

export interface DishOptionGroup {
  id?: number
  name: string
  type: DishOptionType
  required: boolean
  sort: number
  options: DishOptionItem[]
}

export interface DishDetail extends DishBrief {
  description: string
  unit: string
  tags: string[]
  isRecommend: boolean
  skus: DishSku[]
  optionGroups: DishOptionGroup[]
}

/** POST /merchant/dishes 与 PATCH /merchant/dishes/{id} 的请求体 */
export interface DishInput {
  categoryId: number
  name: string
  subtitle?: string
  image?: string
  description?: string
  price: number
  memberPrice?: number
  unit: string
  stockType: DishStockType
  stock?: number
  sort?: number
  isRecommend?: boolean
  tags: string[]
  status?: DishStatus
  skus: DishSku[]
  optionGroups: DishOptionGroup[]
}

export interface DishListParams extends PageQuery {
  categoryId?: number
  status?: DishStatus
}
