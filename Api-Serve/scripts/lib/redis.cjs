/**
 * 冒烟脚本共用的 Redis 连接。
 *
 * 与 lib/db.cjs 同一个理由：验证码这类数据**本来就不该有 HTTP 接口能读**，
 * 但冒烟要断言「发出去的码确实是 6 位数字」「验证通过即作废」，只能直连缓存去取。
 * 连接参数同样从 Api-Serve/.env 读，避免脚本里再写一份。
 */
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function connect() {
  const env = loadEnv();
  return new Redis({
    host: env.REDIS_HOST || '127.0.0.1',
    port: Number(env.REDIS_PORT || 6379),
    password: env.REDIS_PASSWORD || undefined,
    db: Number(env.REDIS_DB || 0),
  });
}

module.exports = { loadEnv, connect };
