/**
 * 临时：① 把 DESIGN.md 里的生产基础设施标识换成占位符；② 重跑内容级门禁（修好中文文件名）。
 * 全程不打印任何真实值。跑完即删。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const ENV = path.join(REPO, 'Api-Serve', '.env');
const DESIGN = path.join(REPO, 'DESIGN.md');

const SKIP_KEYS = new Set(['DB_HOST', 'REDIS_HOST', 'DB_USER', 'DB_NAME', 'APP_PORT', 'JWT_ALGORITHM']);
const secrets = [];
for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!m) continue;
  const [, key, value] = m;
  if (value.length < 8 || SKIP_KEYS.has(key)) continue;
  if (!/PASSWORD|SECRET|TOKEN|ENCRYPTION|DOMAIN|ORIGINS|HOSTS|_HOST|KEY/.test(key)) continue;
  secrets.push({ key, value });
}

/* ---- ① 脱敏 DESIGN.md ---- */
let text = fs.readFileSync(DESIGN, 'utf8');
const changed = [];
for (const { key, value } of secrets) {
  if (text.includes(value)) {
    text = text.split(value).join(`<${key}>`);
    changed.push(key);
  }
}
fs.writeFileSync(DESIGN, text);
console.log(`DESIGN.md 脱敏：${changed.length ? changed.join(', ') : '无需改动'}`);

/* ---- ② 重扫全部暂存内容（用 -c core.quotePath=false 拿到原始 UTF-8 路径）---- */
const git = (args) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
console.log(`\n重新扫描 ${staged.length} 个暂存文件…`);

let hits = 0;
let unreadable = 0;
for (const file of staged) {
  let content;
  try {
    content = git(['show', `:${file}`, '--']);
  } catch {
    unreadable += 1;
    console.log(`  读不到: ${file}`);
    continue;
  }
  for (const { key, value } of secrets) {
    if (content.includes(value)) {
      hits += 1;
      console.log(`  命中 ${key} -> ${file}`);
    }
  }
}
console.log(`\n结果：命中 ${hits} 处，读不到 ${unreadable} 个文件。`);
console.log(hits === 0 && unreadable === 0 ? '通过：可以推送。' : '未通过：先处理再推。');
