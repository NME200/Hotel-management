import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  ActivityAction,
  ActivitySlot,
  ActivityStatus,
} from '../../../common/constants/dict';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import {
  MEMBER_DAY_MULTIPLIER,
  memberDayInfo,
} from '../../../common/constants/member-program';
import { Activity } from '../../../database/entities/activity.entity';
import type { ActivityCardSource, ActivityCardView } from '../models/client-activity.model';
import { ClientCouponService } from '../coupon/client-coupon.service';
import { ClientPromotionService } from '../promotion/client-promotion.service';
import { ClientStoreService } from '../store/client-store.service';

const SYSTEM_CARD_ID: Record<Exclude<ActivityCardSource, 'activity'>, number> = {
  coupon: -1,
  member_day: -2,
  notice: -3,
};

/**
 * 顾客端运营位卡片。
 *
 * 三条合成规则写在 cards() 里，商户端的可见行为只有两种：
 * 配了这个位置就用商户的，没配就退回到系统按真实数据生成的那张卡。
 */
@Injectable()
export class ClientActivityService {
  private readonly activities: TenantRepo<Activity>;

  constructor(
    @InjectRepository(Activity) activityRepository: Repository<Activity>,
    private readonly coupons: ClientCouponService,
    private readonly stores: ClientStoreService,
    private readonly promotions: ClientPromotionService,
  ) {
    this.activities = new TenantRepo(activityRepository);
  }

  async cards(merchantId: number, slot: ActivitySlot): Promise<ActivityCardView[]> {
    const rows = await this.activities.list(merchantId, {
      where: { slot, status: ActivityStatus.Enabled },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const now = new Date();
    const cards = rows
      .filter((row) => inEffect(row, now))
      .map((row) => ({
        id: row.id,
        source: 'activity' as ActivityCardSource,
        slot,
        title: row.title,
        subTitle: row.subTitle,
        icon: row.icon,
        action: row.action,
        actionText: actionTextOf(row.action),
        promotionId: row.promotionId,
      }));

    /**
     * 绑了限时活动的卡，活动一过期就成了死链：
     * 点进去只会有一个筛不出任何菜的菜单，所以这里直接不发。
     */
    const linked = cards.filter((card) => card.action === ActivityAction.Promotion);
    if (linked.length > 0) {
      const live = new Set(
        (await this.promotions.activeOf(merchantId, now)).map((item) => item.id),
      );
      for (let i = cards.length - 1; i >= 0; i -= 1) {
        const card = cards[i]!;
        if (card.action === ActivityAction.Promotion && !live.has(card.promotionId ?? -1)) {
          cards.splice(i, 1);
        }
      }
    }

    if (slot === ActivitySlot.Member) {
      return cards;
    }

    if (slot === ActivitySlot.Mine) {
      // 「我的」页只渲染第一张：商户配了会员活动就顶掉系统生成的会员日卡
      return cards.length > 0 ? cards : [memberDayCard(slot)];
    }

    const withCoupons = cards.some((card) => card.action === ActivityAction.Coupons)
      ? cards
      : [...cards, ...(await this.couponCards(merchantId, slot))];
    if (withCoupons.length > 0) {
      return withCoupons;
    }
    const notice = (await this.stores.resolveById(merchantId)).store.notice;
    return notice ? [noticeCard(slot, notice)] : [];
  }

  private async couponCards(
    merchantId: number,
    slot: ActivitySlot,
  ): Promise<ActivityCardView[]> {
    // 未登录口径：首页要在顾客登录前就把可领的券讲清楚，领取那一步才要登录
    const claimable = (await this.coupons.claimable(merchantId, null)).filter(
      (item) => item.claimable,
    );
    if (claimable.length === 0) {
      return [];
    }
    const best = claimable[0]!;
    return [
      {
        id: SYSTEM_CARD_ID.coupon,
        source: 'coupon',
        slot,
        title:
          claimable.length > 1
            ? `${claimable.length} 张券待领取`
            : `${best.faceText} 券待领取`,
        subTitle: `${best.thresholdText} · ${best.scopeText}`,
        icon: 'ticket',
        action: ActivityAction.Coupons,
        actionText: actionTextOf(ActivityAction.Coupons),
        promotionId: null,
      },
    ];
  }
}

function inEffect(row: Activity, now: Date): boolean {
  if (row.startsAt && row.startsAt.getTime() > now.getTime()) {
    return false;
  }
  return !row.endsAt || row.endsAt.getTime() >= now.getTime();
}

/** 跳转动作的文字；前端只渲染，不再按 action 自己拼文案。 */
function actionTextOf(action: ActivityAction): string | null {
  switch (action) {
    case ActivityAction.Coupons:
      return '去领券';
    case ActivityAction.Menu:
      return '去点餐';
    case ActivityAction.Member:
      return '会员中心';
    case ActivityAction.Stores:
      return '选门店';
    case ActivityAction.Search:
      return '去搜索';
    case ActivityAction.Promotion:
      return '去看活动';
    default:
      return null;
  }
}

function memberDayCard(slot: ActivitySlot): ActivityCardView {
  const info = memberDayInfo();
  const days = info.memberDays.join('/');
  return {
    id: SYSTEM_CARD_ID.member_day,
    source: 'member_day',
    slot,
    title: info.isMemberDay ? '今天是会员日' : `会员日 · 每月 ${days} 日`,
    // 「我的」页这枚色块只放规则本身；倒计时留给会员中心提示条，两处不重复同一句话
    subTitle: info.isMemberDay
      ? `今天消费 1 元得 ${MEMBER_DAY_MULTIPLIER} 点成长值`
      : '当天完成订单，消费成长值翻倍',
    icon: 'calendar',
    action: ActivityAction.Member,
    actionText: actionTextOf(ActivityAction.Member),
    promotionId: null,
  };
}

function noticeCard(slot: ActivitySlot, notice: string): ActivityCardView {
  return {
    id: SYSTEM_CARD_ID.notice,
    source: 'notice',
    slot,
    title: '门店公告',
    subTitle: notice,
    icon: null,
    action: ActivityAction.None,
    actionText: null,
    promotionId: null,
  };
}
