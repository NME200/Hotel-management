/**
 * 冒烟脚本共用的数据库连接工具。
 *
 * 冒烟原则是"用 HTTP 接口验证业务行为"，但有两类事只能直连数据库做：
 * 1. 造前置数据（订单目前只来自种子数据，没有创建接口）；
 * 2. 验证"密文落库"这类接口根本不该暴露的事实。
 *
 * 连接参数从 Api-Serve/.env 读取，避免脚本里再写一份。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

async function connect() {
  const env = loadEnv();
  return mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
}

module.exports = { loadEnv, connect };
