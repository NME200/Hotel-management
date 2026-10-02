import { OptionGroupType } from '../../../common/constants/dict';

export interface ClientSkuView {
  id: number;
  name: string;
  price: number;
  specDesc: string | null;
  /** 库存：null 表示不限（unlimited） */
  stock: number | null;
  soldOut: boolean;
  /** 相对菜品基础价的差价，规格选择器上直接显示「大份 +¥6」 */
  priceDelta: number;
  sort: number;
}

export interface ClientOptionItemView {
  name: string;
  priceDelta: number;
  sort: number;
}

export interface ClientOptionGroupView {
  id: number;
  name: string;
  type: OptionGroupType;
  required: boolean;
  options: ClientOptionItemView[];
  sort: number;
}

export interface ClientDishBriefView {
  id: number;
  categoryId: number;
  name: string;
  subtitle: string | null;
  image: string | null;
  price: number;
  /** 会员价；为 null 表示该菜不参与会员价 */
  memberPrice: number | null;
  /** 会员立减额（基础价 - 会员价），选规格后仍按这个额度减 */
  memberDiscount: number;
  /** 会员提示文案；活动价比会员价还便宜时为 null，避免承诺一个不会发生的优惠 */
  memberTip: string | null;
  /** 限时活动：三个字段由缓存之后的 stamp 追加，改价/停用不会等到菜单缓存过期 */
  promotionId: number | null;
  promotionBadge: string | null;
  /** 活动价（元，按菜品基础价算）；与会员价同时存在时成交取低 */
  promotionPrice: number | null;
  unit: string;
  tags: string[];
  salesCount: number;
  stock: number | null;
  soldOut: boolean;
  isRecommend: boolean;
  /** 是否需要先选规格/加料才能加购 */
  needChoose: boolean;
  skuCount: number;
  optionGroupCount: number;
}

export interface ClientDishDetailView extends ClientDishBriefView {
  description: string | null;
  skus: ClientSkuView[];
  optionGroups: ClientOptionGroupView[];
  /** 搭配推荐：同分类下按销量取的其他菜品 */
  related: ClientDishBriefView[];
}

export interface ClientMenuCategoryView {
  id: number;
  name: string;
  icon: string | null;
  dishes: ClientDishBriefView[];
}

export interface ClientMenuView {
  categories: ClientMenuCategoryView[];
  /** 服务端生成时间：小程序据此判断缓存是否过期 */
  generatedAt: Date;
}

/** 购物车条目：只带选择意图与数量，价格一律由后端按当前菜品数据重算。 */
export interface CartItemInput {
  dishId: number;
  skuId?: number | null;
  optionSelections?: ClientOptionSelectionInput[];
  quantity: number;
}

export interface ClientOptionSelectionInput {
  /** 加料分组 ID */
  groupId: number;
  /** 组内选中的选项名称，多选组可给多个 */
  optionNames: string[];
}
