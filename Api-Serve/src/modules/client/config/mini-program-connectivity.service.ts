import { Injectable } from '@nestjs/common';
import { MiniProgramConfigService } from './mini-program-config.service';
import type { MiniProgramConnectivityResult } from './dto/mini-program-config.dto';
import { WechatMiniService } from '../wechat/wechat-mini.service';

/**
 * 平台后台「小程序配置」的自检按钮：先查本地配置完整性，
 * 再用凭据探测微信接口，两段分开报，避免"配置漏填"和"网络/白名单"混成同一句话。
 */
@Injectable()
export class MiniProgramConnectivityService {
  constructor(
    private readonly configs: MiniProgramConfigService,
    private readonly wechat: WechatMiniService,
  ) {}

  async check(): Promise<MiniProgramConnectivityResult> {
    const checkedAt = new Date();
    const effective = await this.configs.getEffective();

    if (!effective.loginEnabled) {
      return { ok: false, message: '登录开关已关闭，顾客无法进入小程序', checkedAt };
    }
    if (!effective.configured) {
      return {
        ok: false,
        message: `缺少必填配置：${effective.missingFields.join('、')}`,
        checkedAt,
      };
    }

    const credential = await this.wechat.verifyCredentials();
    return { ok: credential.ok, message: credential.message, checkedAt };
  }
}
