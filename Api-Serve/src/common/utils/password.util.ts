import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LENGTH = 32;
const CRYPTO_PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const ALGORITHM_TAG = 'scrypt';

function deriveKey(
  password: string,
  salt: Buffer,
  keylength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * 使用 Node 内置 scrypt 派生密钥，避免引入需要编译的原生依赖。
 * 存储格式：scrypt$N$r$p$盐$散列
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(plain, salt, KEY_LENGTH, CRYPTO_PARAMS);
  return [
    ALGORITHM_TAG,
    CRYPTO_PARAMS.N,
    CRYPTO_PARAMS.r,
    CRYPTO_PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM_TAG) {
    return false;
  }

  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await deriveKey(plain, salt, expected.length, {
    N: Number.parseInt(n, 10),
    r: Number.parseInt(r, 10),
    p: Number.parseInt(p, 10),
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
