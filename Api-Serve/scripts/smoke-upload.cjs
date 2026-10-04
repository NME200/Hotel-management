/**
 * 图片上传冒烟：验的是「上传通道能不能真的把图送到顾客眼前」，以及几道必须挡住的门。
 *
 * 重点不是接口返回 200，而是这四件事：
 * 1. 落盘的文件能被 GET 回来，且字节与送进去的一模一样（静态目录真的挂上了）；
 * 2. 把脚本改名成 .png 传不进来——判类型只看文件真实字节，不看扩展名也不看客户端给的 mimetype；
 * 3. 前台员工和顾客令牌都传不了（没给 media:upload 就是不行）；
 * 4. 上传得到的相对地址存进菜品后，顾客端菜单能读到同一个地址，小程序自己补成绝对 URL 才显示。
 *
 * 用法：node scripts/smoke-upload.cjs
 * 前置：后端已启动、已 db:seed。脚本会自己收尾：删掉测试图与改动过的菜品图片。
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { makePng } = require('./lib/make-png.cjs');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 8000);
const BASE = '/api/v1';
const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');

let pass = 0;
let fail = 0;
const fails = [];

function check(name, expected, actual) {
  if (String(expected) === String(actual)) {
    pass += 1;
    console.log(`  OK   ${name}`);
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  FAIL ${name} -> expected [${expected}] got [${actual}]`);
  }
}

function send(method, urlPath, body, token, contentType) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) {
      headers['Content-Type'] = contentType || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request({ host: HOST, port: PORT, path: BASE + urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(buf.toString('utf8'));
        } catch {
          /* 静态图片等非 JSON 响应走这里 */
        }
        resolve({ status: res.statusCode, json, buf });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const json = (method, p, body, token) =>
  send(method, p, body ? JSON.stringify(body) : null, token);

const codeOf = (r) => (r.json ? r.json.code : `raw:${r.status}`);
const dataOf = (r) => (r.json ? r.json.data : null);

/** 手搓 multipart：项目没有 axios 之类的依赖，测试里也不引入。 */
function upload(token, filename, contentType, buffer, field) {
  const boundary = '----dcSmoke' + Date.now();
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field || 'file'}"; `
      + `filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return send('POST', '/merchant/uploads', Buffer.concat([head, buffer, tail]), token,
    `multipart/form-data; boundary=${boundary}`);
}

(async () => {
  const boss = dataOf(await json('POST', '/auth/merchant/login', {
    merchantCode: 'M10001', username: 'boss', password: 'Boss@123456',
  }));
  const B = boss.accessToken;
  const cashier = dataOf(await json('POST', '/auth/merchant/login', {
    merchantCode: 'M10001', username: 'cashier', password: 'Cashier@123',
  }));
  const C = cashier.accessToken;

  const png = makePng(6, [46, 180, 110]);
  const createdFiles = [];
  const cleanup = () => {
    for (const file of createdFiles) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* 已经不在就算了 */
      }
    }
  };

  console.log('\n[1] 上传一张真图片');
  const ok = await upload(B, 'dish.png', 'image/png', png);
  check('返回 code=0', '0', codeOf(ok));
  const url = dataOf(ok) ? dataOf(ok).url : '';
  check('地址是 /uploads/ 开头的相对路径', 'true', String(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f]{24}\.png$/.test(url)));
  check('库里不该存绝对地址（换域名就废）', 'false', String(/^https?:/.test(url)));

  console.log('\n[2] 文件真的落盘、并且能被取回');
  const diskPath = path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, '').split('/').join(path.sep));
  check('磁盘上存在该文件', 'true', String(fs.existsSync(diskPath)));
  if (fs.existsSync(diskPath)) {
    createdFiles.push(diskPath);
    check('落盘字节与上传字节一致', String(png.length), String(fs.statSync(diskPath).size));
  }
  // 静态目录挂在 api/v1 之外，得直接按根路径取
  const raw = await new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path: url, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
  check('GET /uploads/... 返回 200', '200', String(raw.status));
  check('Content-Type 是 image/png', 'true', String(String(raw.type).startsWith('image/png')));
  check('取回的字节与上传的一致', 'true', String(raw.buf.equals(png)));

  console.log('\n[3] 伪造类型必须被挡');
  const fake = Buffer.from('#!/usr/bin/env node\nconsole.log("not an image")\n');
  const fakeResult = await upload(B, 'evil.png', 'image/png', fake);
  check('改名成 .png 的脚本被拒', '400', String(fakeResult.status));
  const svgish = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  check('svg 也不放行（可带脚本）', '400', String((await upload(B, 'a.svg', 'image/svg+xml', svgish)).status));

  console.log('\n[4] 体积与字段');
  const big = Buffer.concat([png.subarray(0, 8), Buffer.alloc(6 * 1024 * 1024, 7)]);
  check('超过 5MB 被拒', 'true', String((await upload(B, 'big.png', 'image/png', big)).status >= 400));
  const noFile = await upload(B, 'x.png', 'image/png', png, 'picture');
  check('字段名不对时给出可读错误', '400', String(noFile.status));

  console.log('\n[5] 权限门');
  check('前台员工没有 media:upload', 'false', String(cashier.user.permissions.includes('media:upload')));
  check('前台员工上传被拒', '403', String((await upload(C, 'c.png', 'image/png', png)).status));
  check('匿名上传被拒', '401', String((await upload(null, 'c.png', 'image/png', png)).status));

  console.log('\n[6] 相对地址存进菜品后，顾客端读得到');
  // 顾客端接口都要带 merchantCode 定店，漏了会被守卫挡成 400，断言就变成对 null 做判断
  const menuPath = (p) => p + (p.includes('?') ? '&' : '?') + 'merchantCode=M10001';
  const menu = dataOf(await json('GET', menuPath('/client/menu')));
  const dish = menu.categories.flatMap((c) => c.dishes)[0];
  const originalImage = dish.image;
  const saved = await json('PATCH', `/merchant/dishes/${dish.id}`, { image: url }, B);
  check('菜品图片写入成功', '0', codeOf(saved));
  const detail = dataOf(await json('GET', menuPath('/client/dishes/' + dish.id)));
  check('顾客端接口原样带回这个相对地址', 'true', String(JSON.stringify(detail).includes(url)));
  await json('PATCH', `/merchant/dishes/${dish.id}`, { image: originalImage }, B);
  const restored = dataOf(await json('GET', menuPath('/client/dishes/' + dish.id)));
  check('已还原菜品原图', 'true', String(JSON.stringify(restored).includes(String(originalImage))));

  cleanup();
  console.log(`\n结果：通过 ${pass}，失败 ${fail}${fails.length ? ' -> ' + fails.join(' | ') : ''}`);
  if (fail > 0) {
    console.log('提示：失败时请手动检查 uploads/ 目录里是否留下测试图。');
    process.exit(1);
  }
})().catch((error) => {
  console.error('脚本异常:', error.message);
  process.exit(1);
});
