import type { ActivityAction, ActivitySlot } from '../../../common/constants/dict';

/**
 * 卡片来源。
 *
 * activity 是商户自己配的那条；其余三张是系统按当下真实数据合成的，
 * 顾客端拿到的是同一种结构，不需要为来源写分支。
 */
export type ActivityCardSource = 'activity' | 'coupon' | 'member_day' | 'notice';

export interface ActivityCardView {
  /** 合成卡用固定负数，前端 v-for 的 key 才不会撞车 */
  id: number;
  source: ActivityCardSource;
  slot: ActivitySlot;
  /** 主标题：整句话由后端拼好，前端只渲染 */
  title: string;
  subTitle: string | null;
  /** 图标机器码，前端映射成品牌色字符 */
  icon: string | null;
  action: ActivityAction;
  /** 按钮文案：跳转动作的文字，同样由后端给，前端不再按 action 自己拼 */
  actionText: string | null;
  /** action=promotion 时给出，顾客点进菜单只看这个活动的菜 */
  promotionId: number | null;
}
