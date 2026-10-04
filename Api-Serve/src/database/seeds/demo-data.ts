import { StaffRole } from '../../common/constants/dict';

export interface DishSeed {
  name: string;
  subtitle: string;
  price: number;
  memberPrice: number | null;
  unit: string;
  tags: string[];
  isRecommend: boolean;
  salesCount: number;
  /** 省略时表示该菜品无规格，价格直接取 dish.price */
  skus?: { name: string; price: number; specDesc: string }[];
  optionGroups: {
    name: string;
    type: 'single' | 'multi';
    required: boolean;
    options: { name: string; priceDelta: number }[];
  }[];
}

export interface CategorySeed {
  name: string;
  sort: number;
  dishes: DishSeed[];
}

export interface MemberSeed {
  nickname: string;
  phone: string;
  gender: 'unknown' | 'male' | 'female';
  level: 'normal' | 'silver' | 'gold' | 'vip';
  points: number;
  balance: number;
}

export interface MerchantSeed {
  code: string;
  name: string;
  contactName: string;
  contactPhone: string;
  store: {
    name: string;
    province: string;
    city: string;
    district: string;
    address: string;
    longitude: number;
    latitude: number;
    phone: string;
    notice: string;
    businessHours: string[];
    status: 'open' | 'closed';
  };
  staffs: {
    username: string;
    password: string;
    realName: string;
    phone: string;
    role: StaffRole;
  }[];
  categories: CategorySeed[];
  members: MemberSeed[];
  orderCount: number;
}

const SPICY_GROUP = {
  name: '辣度',
  type: 'single' as const,
  required: true,
  options: [
    { name: '不辣', priceDelta: 0 },
    { name: '微辣', priceDelta: 0 },
    { name: '中辣', priceDelta: 0 },
    { name: '特辣', priceDelta: 0 },
  ],
};

export const PLATFORM_ACCOUNT_SEEDS = [
  {
    username: 'admin',
    password: 'Admin@123456',
    realName: '平台超级管理员',
    phone: '13900000000',
    role: 'platform_admin',
  },
  {
    username: 'operator',
    password: 'Operator@123456',
    realName: '平台运营',
    phone: '13900000001',
    role: 'platform_operator',
  },
];

export const MERCHANT_SEEDS: MerchantSeed[] = [
  {
    code: 'M10001',
    name: '川味小馆（演示商户）',
    contactName: '张三',
    contactPhone: '13800000001',
    store: {
      name: '川味小馆·总店',
      province: '四川省',
      city: '成都市',
      district: '武侯区',
      address: '天府大道中段 199 号 1 层',
      longitude: 104.0657350,
      latitude: 30.5729350,
      phone: '028-88886666',
      notice: '高峰时段出餐约 15 分钟，耐心等候哦～',
      businessHours: ['10:00-14:00', '17:00-21:30'],
      status: 'open',
    },
    staffs: [
      { username: 'boss', password: 'Boss@123456', realName: '张三', phone: '13800000001', role: StaffRole.Owner },
      { username: 'manager', password: 'Manager@123', realName: '李四', phone: '13800000002', role: StaffRole.Manager },
      { username: 'cashier', password: 'Cashier@123', realName: '王五', phone: '13800000003', role: StaffRole.Cashier },
      { username: 'kitchen', password: 'Kitchen@123', realName: '赵六', phone: '13800000004', role: StaffRole.Kitchen },
      // 服务员：能开台清台，但进不了收银台 —— 用来验证 table:operate 与 cashier:use 是两回事
      { username: 'waiter', password: 'Waiter@123', realName: '小李', phone: '13800000005', role: StaffRole.Waiter },
    ],
    categories: [
      {
        name: '招牌推荐',
        sort: 1,
        dishes: [
          {
            name: '水煮牛肉',
            subtitle: '麻辣鲜香，现点现做',
            price: 68,
            memberPrice: 62,
            unit: '份',
            tags: ['招牌', '麻辣'],
            isRecommend: true,
            salesCount: 186,
            skus: [
              { name: '标准份', price: 68, specDesc: '约 500g' },
              { name: '大份', price: 88, specDesc: '约 750g' },
            ],
            optionGroups: [SPICY_GROUP],
          },
          {
            name: '宫保鸡丁',
            subtitle: '花生脆香，下饭神器',
            price: 42,
            memberPrice: 38,
            unit: '份',
            tags: ['家常'],
            isRecommend: true,
            salesCount: 240,
            optionGroups: [SPICY_GROUP],
          },
        ],
      },
      {
        name: '经典川菜',
        sort: 2,
        dishes: [
          {
            name: '麻婆豆腐',
            subtitle: '嫩豆腐配牛肉末',
            price: 28,
            memberPrice: 25,
            unit: '份',
            tags: ['麻辣', '素食可选'],
            isRecommend: false,
            salesCount: 152,
            optionGroups: [SPICY_GROUP],
          },
          {
            name: '回锅肉',
            subtitle: '二刀肉蒜苗同炒',
            price: 46,
            memberPrice: null,
            unit: '份',
            tags: ['经典'],
            isRecommend: false,
            salesCount: 98,
            optionGroups: [],
          },
          {
            name: '鱼香肉丝',
            subtitle: '酸甜适口',
            price: 36,
            memberPrice: 33,
            unit: '份',
            tags: ['经典'],
            isRecommend: false,
            salesCount: 120,
            optionGroups: [],
          },
        ],
      },
      {
        name: '凉菜小食',
        sort: 3,
        dishes: [
          {
            name: '口水鸡',
            subtitle: '红油鸡块',
            price: 32,
            memberPrice: 29,
            unit: '份',
            tags: ['凉菜'],
            isRecommend: false,
            salesCount: 64,
            optionGroups: [
              {
                name: '加料',
                type: 'multi',
                required: false,
                options: [
                  { name: '加花生碎', priceDelta: 2 },
                  { name: '加香菜', priceDelta: 0 },
                  { name: '加脆哨', priceDelta: 4 },
                ],
              },
            ],
          },
          {
            name: '拍黄瓜',
            subtitle: '清爽解腻',
            price: 16,
            memberPrice: null,
            unit: '份',
            tags: ['凉菜'],
            isRecommend: false,
            salesCount: 88,
            optionGroups: [],
          },
        ],
      },
      {
        name: '主食汤品',
        sort: 4,
        dishes: [
          {
            name: '担担面',
            subtitle: '小碗现煮',
            price: 18,
            memberPrice: 16,
            unit: '碗',
            tags: ['主食'],
            isRecommend: false,
            salesCount: 210,
            skus: [
              { name: '小碗', price: 18, specDesc: '约 250g' },
              { name: '大碗', price: 24, specDesc: '约 400g' },
            ],
            optionGroups: [SPICY_GROUP],
          },
          {
            name: '番茄蛋花汤',
            subtitle: '每日现煲',
            price: 12,
            memberPrice: null,
            unit: '例',
            tags: ['汤'],
            isRecommend: false,
            salesCount: 45,
            optionGroups: [],
          },
        ],
      },
      {
        name: '饮品',
        sort: 5,
        dishes: [
          {
            name: '酸梅汤',
            subtitle: '冰镇大杯',
            price: 8,
            memberPrice: 6,
            unit: '杯',
            tags: ['饮品'],
            isRecommend: false,
            salesCount: 320,
            skus: [
              { name: '中杯', price: 8, specDesc: '500ml' },
              { name: '大杯', price: 12, specDesc: '750ml' },
            ],
            optionGroups: [
              {
                name: '甜度',
                type: 'single',
                required: true,
                options: [
                  { name: '标准糖', priceDelta: 0 },
                  { name: '半糖', priceDelta: 0 },
                  { name: '无糖', priceDelta: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
    members: [
      { nickname: '爱吃辣的猫', phone: '13511110001', gender: 'female', level: 'gold', points: 860, balance: 128.5 },
      { nickname: '王小二', phone: '13511110002', gender: 'male', level: 'silver', points: 240, balance: 0 },
      { nickname: '糖糖', phone: '13511110003', gender: 'female', level: 'vip', points: 2380, balance: 566 },
      { nickname: '老陈', phone: '13511110004', gender: 'male', level: 'normal', points: 30, balance: 0 },
    ],
    orderCount: 26,
  },
  {
    code: 'M10002',
    name: '江南面馆（隔离验证）',
    contactName: '孙七',
    contactPhone: '13800000009',
    store: {
      name: '江南面馆·总店',
      province: '江苏省',
      city: '苏州市',
      district: '姑苏区',
      address: '观前街 88 号',
      longitude: 120.6173350,
      latitude: 31.3109350,
      phone: '0512-66668888',
      notice: '面粉现压，欢迎光临',
      businessHours: ['07:00-20:00'],
      status: 'open',
    },
    staffs: [
      { username: 'boss', password: 'Boss@123456', realName: '孙七', phone: '13800000009', role: StaffRole.Owner },
    ],
    categories: [
      {
        name: '面食',
        sort: 1,
        dishes: [
          {
            name: '阳春面',
            subtitle: '清汤细面',
            price: 14,
            memberPrice: 12,
            unit: '碗',
            tags: ['主食'],
            isRecommend: true,
            salesCount: 300,
            optionGroups: [],
          },
          {
            name: '爆鱼面',
            subtitle: '苏式浇头',
            price: 26,
            memberPrice: null,
            unit: '碗',
            tags: ['主食', '招牌'],
            isRecommend: false,
            salesCount: 120,
            optionGroups: [],
          },
        ],
      },
    ],
    members: [
      { nickname: '苏州老饕', phone: '13522220001', gender: 'unknown', level: 'silver', points: 120, balance: 20 },
    ],
    orderCount: 6,
  },
];
