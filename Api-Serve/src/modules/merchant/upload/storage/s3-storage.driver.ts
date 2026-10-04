import type { S3UploadSettings } from '../../../../config/configuration';
import { EMPTY_PAYLOAD_SHA256, encodeS3Key, sha256Hex, signAwsV4 } from './aws-v4-signer';
import type { ObjectStorageDriver } from './object-storage.interface';

/**
 * S3 协议兼容的对象存储驱动。
 *
 * 云托管下副本数是弹性的，商户上传的图落在某个副本的本地磁盘上，
 * 下一次请求被路由到别的副本就是 404，容器重建更是直接丢图 —— 必须外置。
 *
 * 用 S3 协议而不是绑定某家厂商：腾讯云 COS、阿里云 OSS、MinIO 都兼容，
 * 换服务商只改 endpoint 与密钥，代码不动。
 */
export class S3StorageDriver implements ObjectStorageDriver {
  readonly kind = 's3' as const;
  readonly staticDir = null;

  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly forcePathStyle: boolean;
  private readonly publicBaseUrl: string;

  constructor(settings: S3UploadSettings) {
    this.bucket = settings.bucket;
    this.region = settings.region;
    this.endpoint = settings.endpoint;
    this.accessKeyId = settings.accessKeyId;
    this.secretAccessKey = settings.secretAccessKey;
    this.forcePathStyle = settings.forcePathStyle;
    this.publicBaseUrl = settings.publicBaseUrl;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const target = this.resolveTarget(key);
    const payloadHash = body.length > 0 ? sha256Hex(body) : EMPTY_PAYLOAD_SHA256;

    const { authorization, headers } = signAwsV4({
      method: 'PUT',
      canonicalUri: target.canonicalUri,
      headers: {
        host: target.host,
        'content-type': contentType,
        // 文件名带随机串且永不复用，内容不会变，可以放心长缓存
        'cache-control': 'public, max-age=31536000, immutable',
        // S3 要求显式声明请求体哈希，服务端据此校验内容未被篡改
        'x-amz-content-sha256': payloadHash,
      },
      payloadHash,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      service: 's3',
    });

    const response = await fetch(target.url, {
      method: 'PUT',
      headers: { ...headers, authorization },
      body: new Uint8Array(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `对象存储写入失败 ${response.status} ${response.statusText} ${detail.slice(0, 200)}`,
      );
    }
  }

  urlFor(key: string): string {
    return `${this.publicBaseUrl}/${encodeS3Key(key)}`;
  }

  /**
   * 定位请求地址，同时给出参与签名的规范路径与 Host。
   *
   * 两种寻址方式都必须支持：自建 MinIO 通常用路径风格（域名里塞不进桶名），
   * 云厂商 COS/OSS 则默认虚拟主机风格。
   */
  private resolveTarget(key: string): {
    url: string;
    canonicalUri: string;
    host: string;
  } {
    const base = new URL(this.endpoint || `https://s3.${this.region}.amazonaws.com`);
    const encodedKey = encodeS3Key(key);

    if (this.forcePathStyle) {
      const canonicalUri = `/${this.bucket}/${encodedKey}`;
      return { url: `${base.origin}${canonicalUri}`, canonicalUri, host: base.host };
    }

    const host = `${this.bucket}.${base.host}`;
    const canonicalUri = `/${encodedKey}`;
    return { url: `${base.protocol}//${host}${canonicalUri}`, canonicalUri, host };
  }
}
