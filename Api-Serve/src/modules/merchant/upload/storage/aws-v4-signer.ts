import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 签名。
 *
 * 自己实现而不是引入 @aws-sdk/client-s3：上传这一条路径只用到「PUT 一个对象」，
 * 为此拖进一个上百个包、且随版本频繁变动的 SDK，对生产镜像和安全面都不划算。
 * S3 兼容的对象存储（腾讯云 COS、阿里云 OSS、MinIO）都接受这套签名，
 * 换服务商只改 endpoint 与密钥。
 *
 * 算法正确性由 `scripts/verify-sigv4.cjs` 用 AWS 官方文档给出的样例向量校验。
 */

export interface SignableRequest {
  method: string;
  /** 已按 S3 规则编码的路径（`/` 保留，其余段做 RFC3986 编码） */
  canonicalUri: string;
  /** 已按字典序排序并编码的查询串；无查询串传空字符串 */
  canonicalQuery?: string;
  /** 参与签名的头，键一律小写；host 必须在内 */
  headers: Record<string, string>;
  /** 请求体十六进制 SHA-256；空体用 EMPTY_PAYLOAD_SHA256 */
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** 签名时刻，默认取当前时间 */
  date?: Date;
}

export interface SignedRequest {
  authorization: string;
  /**
   * 需要随请求发出的头（已含 x-amz-date、x-amz-content-sha256）。
   * 刻意**不含 host**：它参与签名，但由 HTTP 客户端依据 URL 自动补上，
   * 手工再设一遍在部分运行时会被判为非法头。
   */
  headers: Record<string, string>;
}

export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** `2026-10-03T02:15:30Z` → `20261003T021530Z` */
export function amzDateStamp(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function signAwsV4(request: SignableRequest): SignedRequest {
  const date = request.date ?? new Date();
  const amzDate = amzDateStamp(date);
  const dateStamp = amzDate.slice(0, 8);

  // 签名用的头必须全部小写、去首尾空白，并按名称字典序拼接；
  // 顺序错一个字符签名就完全不同，服务端直接返回 403。
  //
  // 这里只补 `x-amz-date`（签名时刻由签名器决定，调用方不该重复算一遍）。
  // 其余头一律由调用方给出 —— 签名器不替业务决定「该签哪些头」，
  // 否则像 `x-amz-content-sha256` 这种 S3 必需、其他服务不需要的头会破坏通用性。
  const headers: Record<string, string> = {
    ...request.headers,
    'x-amz-date': amzDate,
  };
  const headerNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join('');
  const signedHeaders = headerNames.join(';');

  const canonicalRequest = [
    request.method.toUpperCase(),
    request.canonicalUri,
    request.canonicalQuery ?? '',
    canonicalHeaders,
    signedHeaders,
    request.payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${request.region}/${request.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hmacHex(
    buildSigningKey(request.secretAccessKey, dateStamp, request.region, request.service),
    stringToSign,
  );

  return {
    authorization:
      `AWS4-HMAC-SHA256 Credential=${request.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    headers: Object.fromEntries(
      Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'host'),
    ),
  };
}

/** 派生签名密钥：日期 → 区域 → 服务 → 终结符，逐层 HMAC */
function buildSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/**
 * S3 对象键的编码规则：保留 `/` 作为层级分隔，其余按 RFC3986 编码。
 * `encodeURIComponent` 不会转义 `!'()*`，而 SigV4 要求它们被转义。
 */
export function encodeS3Key(key: string): string {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}
