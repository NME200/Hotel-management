import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION = 'v1';

/** 前端回显用的掩码；提交时原样带回即表示"不修改该密钥"。 */
export const SECRET_MASK = '********';

export function parseEncryptionKey(raw: string): Buffer {
  const normalized = raw.trim();
  const candidates = [
    Buffer.from(normalized, 'base64'),
    Buffer.from(normalized.replace(/^0x/i, ''), 'hex'),
    Buffer.from(normalized, 'utf8'),
  ];
  const key = candidates.find((item) => item.length === 32);
  if (!key) {
    throw new Error('CONFIG_ENCRYPTION_KEY 必须是 32 字节（base64 / hex / 原文均可）');
  }
  return key;
}

/**
 * 敏感配置以 AES-256-GCM 加密后入库，格式 `v1:iv:tag:ciphertext`（均 hex）。
 * 主密钥只存在于 .env，因此数据库泄露不等于密钥泄露。
 */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptSecret(stored: string, key: Buffer): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('密文格式不正确');
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`);
}

/** 密钥指纹：只用于人工确认"改了没有"，不泄露任何内容。 */
export function fingerprint(plain: string): string {
  return createHash('sha256').update(plain).digest('hex').slice(0, 8);
}

export function looksLikeMask(value: string | undefined | null): boolean {
  return value === SECRET_MASK || value === undefined;
}

/** 账号类敏感信息的展示脱敏：只留首 4 末 4。 */
export function maskAccountNumber(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 8) {
    return '****';
  }
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 12))}${value.slice(-4)}`;
}
