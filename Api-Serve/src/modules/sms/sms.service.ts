import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CacheKey } from '../../common/constants/cache-key';
import { BusinessException } from '../../common/exceptions/business.exception';
import { RedisService } from '../redis/redis.service';
import { SmsConfigService } from './sms-config.service';

/** 验证码 6 位：4 位容易被撞，8 位顾客抄着累。 */
const CODE_LENGTH = 6;
/** 有效期 5 分钟。再短顾客抄不完，再长等于把凭据挂在那儿等人试。 */
const CODE_TTL_SECONDS = 300;
/** 同一码最多验 5 次，超了直接作废，必须重新获取 */
const MAX_ATTEMPTS = 5;
/** 同号重发间隔 */
const RESEND_GAP_SECONDS = 60;
/** 同号每日上限 */
const DAILY_PHONE_LIMIT = 10;
/** 单 IP 每日上限：防「一个脚本换着一批号码刷」 */
const DAILY_IP_LIMIT = 50;
/** 日窗口的秒数 */
const DAY_SECONDS = 86_400;

interface StoredCode {
  value: string;
  attempts: number;
}

/**
 * 短信验证码：发码、节流、校验。
 *
 * 三条设计口径：
 * 1. **验证码只活在 Redis 里**（5 分钟 TTL、验证通过即删、错满 5 次也删）。
 *    落库的话它就从「临时凭据」变成了长期数据，还得考虑怎么清理。
 * 2. **失败要回滚额度**：厂商拒了（签名没审核、余额不足）不该占用顾客当天的发送次数，
 *    否则配置一修好，所有人还得等到明天。
 * 3. **不告诉调用者这个号码有没有注册过**：发码与校验的文案对新老号码完全一致，
 *    否则这里就成一个「输入手机号看它是不是本店会员」的枚举接口。
 *
 * 通道与凭据一律从 `SmsConfigService` 拿生效值（数据库优先、回落 `.env`），
 * 这样平台后台改完立刻生效，不必重启进程。
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly configs: SmsConfigService,
  ) {}

  /**
   * 发送验证码。
   *
   * 返回的文案对任何号码都一样，理由见类注释第 3 条。
   */
  async sendCode(phone: string, clientIp: string): Promise<void> {
    const config = await this.configs.getEffective();
    const provider = this.configs.providerOf(config.driver);

    if (!config.allowed) {
      throw BusinessException.badRequest(config.disallowReason ?? '当前环境不允许使用该短信通道');
    }
    if (!config.enabled) {
      throw BusinessException.badRequest('短信验证码未开启，请改用微信手机号一键登录');
    }
    if (!provider.isReady(config)) {
      throw BusinessException.badRequest(
        `短信服务未开通（${provider.label} 缺少${config.missingFields.join('、')}），请改用微信手机号一键登录`,
      );
    }

    const gapKey = CacheKey.smsResendGap(phone);
    const gapCount = await this.redis.incrementWithTtl(gapKey, RESEND_GAP_SECONDS);
    if (gapCount > 1) {
      const seconds = await this.redis.ttl(gapKey);
      throw BusinessException.badRequest(
        `发送太快了，请 ${Math.max(seconds, 1)} 秒后再试`,
      );
    }

    const phoneDayKey = CacheKey.smsDailyPhone(phone);
    const phoneDayCount = await this.redis.incrementWithTtl(phoneDayKey, DAY_SECONDS);
    if (phoneDayCount > DAILY_PHONE_LIMIT) {
      throw BusinessException.badRequest('今日验证码发送次数已用完，请明天再试');
    }

    const ipDayKey = CacheKey.smsDailyIp(clientIp || 'unknown');
    const ipDayCount = await this.redis.incrementWithTtl(ipDayKey, DAY_SECONDS);
    if (ipDayCount > DAILY_IP_LIMIT) {
      await this.rollback(phoneDayKey, phoneDayCount);
      throw BusinessException.badRequest('当前网络今日发送次数过多，请稍后再试');
    }

    const code = newCode();
    try {
      await provider.send(config, phone, code);
    } catch (error) {
      // 没发出去就不该占额度：把三把计数一并回滚，顾客可以立刻再点一次
      await this.rollback(gapKey, gapCount);
      await this.rollback(phoneDayKey, phoneDayCount);
      await this.rollback(ipDayKey, ipDayCount);
      throw error;
    }

    await this.redis.setJson(CacheKey.smsCode(phone), { value: code, attempts: 0 } satisfies StoredCode, CODE_TTL_SECONDS);
    this.logger.log(`验证码已发送 手机号尾号=${phone.slice(-4)} 通道=${provider.driver}`);
  }

  /**
   * 校验验证码。通过即删除（一次性），失败累加次数。
   *
   * 累加时沿用**剩余** TTL，不然每次输错都把有效期续成 5 分钟，
   * 相当于给了无限次的尝试窗口。
   */
  async verifyCode(phone: string, code: string): Promise<void> {
    const key = CacheKey.smsCode(phone);
    const stored = await this.redis.getJson<StoredCode>(key);
    if (!stored) {
      throw BusinessException.badRequest('验证码已过期或未获取，请重新获取');
    }
    if (stored.attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw BusinessException.badRequest('验证码错误次数过多，请重新获取');
    }
    if (stored.value !== code.trim()) {
      const remaining = Math.max(await this.redis.ttl(key), 1);
      await this.redis.setJson(key, { value: stored.value, attempts: stored.attempts + 1 }, remaining);
      throw BusinessException.badRequest('验证码不正确');
    }
    await this.redis.del(key);
  }

  private async rollback(key: string, count: number): Promise<void> {
    if (count <= 1) {
      await this.redis.del(key);
      return;
    }
    // 回滚要保住剩余时间，否则日窗口会被无限续期
    const remaining = await this.redis.ttl(key);
    await this.redis.setJson(key, count - 1, Math.max(remaining, 1));
  }
}

/** 6 位数字码。用 crypto 而不是 Math.random：这不是可以近似随机的地方。 */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, '0');
}
