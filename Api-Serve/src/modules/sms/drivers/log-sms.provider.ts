import { Injectable, Logger } from '@nestjs/common';
import { SMS_DRIVER_LABELS, SmsDriver } from '../constants/sms-driver.constant';
import type { EffectiveSmsConfig } from '../models/sms-config.model';
import type { SmsProvider } from '../sms-provider.interface';

/**
 * 只写日志的短信通道：本机与 CI 用它把「发码 → 收码 → 校验」整条闭环跑完。
 *
 * 生产环境一律不允许（`SmsConfigService` 会把 `allowed` 置 false），
 * 否则验证码等于抄送给所有能看日志采集系统的人。
 */
@Injectable()
export class LogSmsProvider implements SmsProvider {
  readonly driver = SmsDriver.Log;
  readonly label = SMS_DRIVER_LABELS[SmsDriver.Log];

  private readonly logger = new Logger(LogSmsProvider.name);

  isReady(_config: EffectiveSmsConfig): boolean {
    return true;
  }

  async send(config: EffectiveSmsConfig, phone: string, code: string): Promise<void> {
    // 手机号只留后 4 位：日志里能对上是谁的那条，又不把完整号码抄进采集系统
    this.logger.log(
      `【${config.enabled ? '开发环境短信' : '短信未开启'}】验证码 ${code} → 手机号尾号 ${phone.slice(-4)}（本通道不真发送）`,
    );
  }

  async probe(_config: EffectiveSmsConfig): Promise<{ ok: boolean; message: string }> {
    return {
      ok: true,
      message: '日志通道就绪：验证码只写进服务日志、不真发送，仅可用于开发与联调',
    };
  }
}
