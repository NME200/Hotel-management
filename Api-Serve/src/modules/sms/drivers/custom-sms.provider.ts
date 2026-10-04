import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  SMS_CUSTOM_DEFAULT_BODY_TEMPLATE,
  SMS_DRIVER_LABELS,
  SmsDriver,
  parseCustomAuthHeader,
  validateCustomBodyTemplate,
  validateCustomEndpoint,
} from '../constants/sms-driver.constant';
import type { EffectiveSmsConfig } from '../models/sms-config.model';
import type { SmsProvider } from '../sms-provider.interface';

const REQUEST_TIMEOUT_MS = 8000;
/** 网关回话只截这么长就够定位了：整段贴给顾客既难看又可能带出对方内部信息。 */
const GATEWAY_ECHO_LIMIT = 120;

/**
 * 自定义短信网关：把验证码 POST 给一个由平台自己指定地址的 HTTP 接口。
 *
 * 存在的理由有两种，都真实出现过：
 * 运营商/集团内已有短信通道（不想再开一个云厂商账号），
 * 或者只用阿里云/腾讯云之外的第三方小通道。这类通道没有统一规范，
 * 所以这里定一份**最小契约**，而不是一套规则引擎：
 *
 * 1. 一律 `POST`，请求体按模板渲染，`Content-Type: application/json`；
 * 2. 模板必须是合法 JSON，变量写成带引号的占位符：`{"phone":"{phone}","code":"{code}"}`；
 * 3. 可用占位符：`{phone}` `{code}` `{signName}` `{templateCode}` `{token}`；
 * 4. 鉴权按 `头名: 头值模板` 注入一个头，头值里的 `{token}` 换成密钥；
 * 5. **HTTP 2xx 即视为发送成功**，其余状态码当作失败并把网关回话摘要报给运营。
 *
 * 模板是「解析成对象再替换」而不是字符串直接替换，因为签名里出现引号时
 * 字符串替换会拼出非法 JSON —— 那是顾客侧的发送失败，排查代价全压在平台身上。
 */
@Injectable()
export class CustomSmsProvider implements SmsProvider {
  readonly driver = SmsDriver.Custom;
  readonly label = SMS_DRIVER_LABELS[SmsDriver.Custom];

  private readonly logger = new Logger(CustomSmsProvider.name);

  isReady(config: EffectiveSmsConfig): boolean {
    if (!config.endpoint?.trim() || !config.customBodyTemplate?.trim()) {
      return false;
    }
    if (validateCustomEndpoint(config.endpoint) || validateCustomBodyTemplate(config.customBodyTemplate)) {
      return false;
    }
    // 鉴权头引用了 {token} 却没有密钥，发出去必然是一个空凭据头，直接判未就绪
    const auth = this.authOf(config);
    return !(auth?.pattern.includes('{token}') && !config.customToken.trim());
  }

  async send(config: EffectiveSmsConfig, phone: string, code: string): Promise<void> {
    const payload = JSON.stringify(this.render(config, phone, code));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const auth = this.authOf(config);
    if (auth) {
      headers[auth.name] = auth.pattern
        .split('{token}')
        .join(config.customToken);
    }

    let response: globalThis.Response;
    try {
      response = await fetch(config.endpoint.trim(), {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`自定义短信网关请求失败 ${config.endpoint}: ${message}`);
      throw new BusinessException('短信网关无响应，请稍后重试或联系平台运营', 502);
    }

    const echo = await readEcho(response);
    if (!response.ok) {
      this.logger.warn(
        `自定义短信网关返回 ${response.status} ${config.endpoint} 回话=${echo}`,
      );
      throw new BusinessException(
        `短信网关返回 ${response.status}${echo ? `：${echo}` : '，未返回原因'}，请联系平台运营核对自定义短信配置`,
        502,
      );
    }
    this.logger.log(`验证码已通过自定义网关发出 ${config.endpoint} 网关回话=${echo || '（空）'}`);
  }

  /**
   * 自检**不打网关**：第三方通道没有「查审核状态」这种免费接口，
   * 真打一次就是真发一条短信（花钱、占额度，还可能被对方风控）。
   * 所以这里只把配置本身验到「发出去一定是个合法请求」，
   * 并明确告诉运营：剩下那一步要自己拿手机号实收一条。
   */
  async probe(config: EffectiveSmsConfig): Promise<{ ok: boolean; message: string }> {
    const endpointIssue = validateCustomEndpoint(config.endpoint);
    if (endpointIssue) {
      return { ok: false, message: endpointIssue };
    }
    const templateIssue = validateCustomBodyTemplate(config.customBodyTemplate);
    if (templateIssue) {
      return { ok: false, message: templateIssue };
    }

    const auth = this.authOf(config);
    if (auth && auth.pattern.includes('{token}') && !config.customToken.trim()) {
      return {
        ok: false,
        message: `鉴权头「${auth.name}」里引用了 {token}，但没有配置网关密钥；要么补密钥，要么把鉴权头改成固定值`,
      };
    }
    if (auth && !auth.pattern.includes('{token}') && config.customToken.trim()) {
      return {
        ok: false,
        message: `已配置网关密钥，但鉴权头「${auth.name}」里没有 {token} 占位符，密钥不会被发出去；请写成形如 ${auth.name}: Bearer {token}`,
      };
    }

    const rendered = this.render(config, '13800000000', '000000');
    const fields = Object.keys(rendered).length;
    return {
      ok: true,
      message: `自定义通道配置可用：POST ${config.endpoint.trim()}（JSON 请求体 ${fields} 个顶层字段${
        auth ? `，鉴权头 ${auth.name}` : '，无鉴权头'
      }）。自检不真发，请用自己的手机号实收一条确认整条链路通。`,
    };
  }

  private authOf(config: EffectiveSmsConfig): { name: string; pattern: string } | null {
    // 留空即「这个网关不要鉴权」；需要默认头的场景由配置层在填了密钥时补上 Bearer 形态
    const raw = config.customAuthHeader.trim();
    if (!raw) {
      return null;
    }
    return parseCustomAuthHeader(raw);
  }

  /** 占位符替换：先按 JSON 解析，只替换字符串叶子节点，替换后再序列化，值里的引号不会拼坏请求体。 */
  private render(
    config: EffectiveSmsConfig,
    phone: string,
    code: string,
  ): Record<string, unknown> {
    const values: Record<string, string> = {
      phone,
      code,
      signName: config.signName,
      templateCode: config.templateCode,
      token: config.customToken,
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(config.customBodyTemplate || SMS_CUSTOM_DEFAULT_BODY_TEMPLATE);
    } catch {
      throw new BusinessException('自定义短信请求体模板不是合法 JSON，请在平台后台「短信配置」中修正', 502);
    }
    return fill(parsed, values) as Record<string, unknown>;
  }
}

function fill(node: unknown, values: Record<string, string>): unknown {
  if (typeof node === 'string') {
    return Object.entries(values).reduce(
      (text, [key, value]) => text.split(`{${key}}`).join(value ?? ''),
      node,
    );
  }
  if (Array.isArray(node)) {
    return node.map((item) => fill(item, values));
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [key, fill(value, values)]),
    );
  }
  return node;
}

async function readEcho(response: globalThis.Response): Promise<string> {
  const text = await response.text().catch(() => '');
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.length > GATEWAY_ECHO_LIMIT ? `${trimmed.slice(0, GATEWAY_ECHO_LIMIT)}…` : trimmed;
}
