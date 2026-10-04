/**
 * 手机号验证码登录冒烟。
 *
 * 十条必须站得住的口径：
 * 1. **发码不泄漏注册状态**：新号码与已注册号码的回话一字不差，
 *    否则这里就成一个「输入手机号看它是不是本店会员」的枚举接口；
 * 2. **验证码只活 5 分钟、错满 5 次作废、用一次即删**（重放不成立）；
 * 3. **发送节流分三层**：同号 60 秒、同号每日、单 IP 每日（只按号码限流换号就能绕过）；
 * 4. **未注册自动建档**，且建档后的身份带脱敏手机号；
 * 5. **商家导入的历史会员（有手机号、无 openid）第一次登录要能认领**，
 *    等级/余额/成长值必须是原有那份，不是从零开始的新档案；
 * 6. 验证码登录**不会**产生第二条同手机号身份（唯一性靠"号码优先"的落位顺序，不靠索引）；
 * 7. 非法手机号、缺门店编号这类输入必须被 DTO 挡在业务之前；
 * 8. **平台端配置口径与支付渠道、云打印机厂商一致**：密钥密文入库、只回掩码 + 指纹、
 *    回传掩码=不修改、空串=清除；配置没就绪时发码给的是可执行的提示而不是 500；
 * 9. **通道口径按通道给**：同一个密钥列在阿里云叫 AccessKey Secret、在腾讯云叫 SecretKey，
 *    必填项与缺项提示都跟着通道走，换通道不会把上一家的密钥读成新家的（列共用，值由运营重填）；
 * 10. **自定义网关这条链路用本机桩验到真发**：模板占位符、鉴权头替换、非 2xx 算失败并回滚额度。
 *
 * 带 `wxCode` 的那条（登录同时绑微信身份）需要开发者工具现取一次性 code，
 * 不放本脚本里：冒烟脚本必须能在没有 IDE 的环境跑。那条走 .e2e/phone-check.cjs。
 *
 * 用法：node scripts/smoke-sms.cjs
 * 前置：后端已启动、已迁移、已 db:seed；SMS_DRIVER=log（开发环境默认），
 *       且 .env 的 SMS_ALIYUN_* 留空（第 8 段要验「缺凭据」这一状态）。
 * 第 8~10 段会改写 sms_config 表：开始前整行快照，结束时原样写回并清掉 sms:config 缓存，
 * 因此真机里已配好的云厂商密钥不会被这套断言弄丢。
 * 第 10 段会占用本机 18099 端口起一个临时 HTTP 桩，跑完即关。
 * 脚本自建自清理，可反复执行。
 */
const http = require('node:http');
const { connect: connectDb } = require('./lib/db.cjs');
const { connect: connectRedis } = require('./lib/redis.cjs');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 8000);
const BASE = '/api/v1';
const MERCHANT = 'M10001';

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

function send(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: HOST,
        port: PORT,
        path: BASE + path,
        method,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          token ? { Authorization: 'Bearer ' + token } : {},
          data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        ),
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(b) });
          } catch {
            resolve({ status: res.statusCode, raw: b.slice(0, 200) });
          }
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 登录类接口受 auth 节流器 10 次/分钟约束，撞上就等一个窗口重试，不把限流当断言失败。 */
async function req(method, path, body, token) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await send(method, path, body, token);
    if (response.status !== 429 || !path.includes('/auth/')) return response;
    console.log('  …… ' + path + ' 被限流，等 20 秒重试（auth 节流器 10 次/分钟）');
    await sleep(20_000);
  }
  return send(method, path, body, token);
}

const codeOf = (r) => (r.json ? r.json.code : `raw:${r.raw}`);
const msgOf = (r) => (r.json ? r.json.message : r.raw);
const dataOf = (r) => (r.json ? r.json.data : null);

/** 测试号段：199 开头的随机号，不会撞上任何真实数据。 */
function testPhone() {
  return `199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

/**
 * 自定义通道的对端网关桩：把收到的请求原样记下来，默认回 200。
 * 冒烟脚本不能依赖任何云账号，所以「自定义短信网关」这条链路用本机端口当对端。
 */
function startEchoGateway(port) {
  const state = { last: null, status: 200, body: { code: 0, message: 'ok' } };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let body = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        /* 不是 JSON 就原样留着，让断言能看到「模板没写成 JSON」这类情况 */
      }
      state.last = { url: req.url, method: req.method, headers: req.headers, body };
      res.writeHead(state.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state.body));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        get last() {
          return state.last;
        },
        reply(status, body) {
          state.status = status;
          state.body = body;
        },
        close: () => new Promise((done) => server.close(done)),
      }),
    );
  });
}

async function main() {
  console.log('手机号验证码登录冒烟开始\n');

  const db = await connectDb();
  const redis = connectRedis();

  const phones = [];
  const createdCustomerIds = [];
  /** sms_config 原行快照，第 8~10 段改写后在 finally 里原样写回 */
  let smsRowBefore = null;
  let smsConfigSnapshotTaken = false;
  let gateway = null;
  /** 下发形态里的密钥字段视图：通道不同，同一个字段的中文名也不同 */
  const secretOf = (item, driver, name) =>
    (item.drivers?.find((d) => d.driver === driver)?.secretFields ?? []).find((f) => f.name === name) ?? {};
  const metaOf = (item, driver) => item.drivers?.find((d) => d.driver === driver) ?? {};

  /** 发码并回读缓存里的码（log 通道下不发真短信，只能从 Redis 取）。 */
  async function issueCode(phone) {
    const sent = await req('POST', '/client/auth/sms/code', { phone });
    if (codeOf(sent) !== 0) {
      throw new Error(`发码失败：${msgOf(sent)}`);
    }
    const stored = JSON.parse(await redis.get(`sms:code:${phone}`));
    return { sent, code: stored.value };
  }

  try {
    /* ---------- 0. 输入校验（放在最前面：这段不依赖发码，且要赶在限流窗口打满之前跑）---------- */
    console.log('\n[7] 输入校验');
    const badPhone = await req('POST', '/client/auth/sms/code', { phone: '12345678901' });
    check('号段不合法被挡', '400', badPhone.status);
    const probe = testPhone();
    const shortPhone = await req('POST', '/client/auth/sms/login', { phone: '138', code: '123456', merchantCode: MERCHANT });
    check('手机号长度不合法被挡', '400', shortPhone.status);
    const noMerchant = await req('POST', '/client/auth/sms/login', { phone: probe, code: '123456' });
    check('缺门店编号被挡', '400', noMerchant.status);
    const badCode = await req('POST', '/client/auth/sms/login', { phone: probe, code: 'abcdef', merchantCode: MERCHANT });
    check('验证码非数字被挡', '400', badCode.status);

    /* ---------- 1. 发码不泄漏注册状态 ---------- */
    console.log('[1] 发码与防枚举');
    const fresh = testPhone();
    phones.push(fresh);
    const seeded = '13511110001';

    const sendFresh = await req('POST', '/client/auth/sms/code', { phone: fresh });
    check('新号码发码成功', '0', codeOf(sendFresh));
    await redis.del(`sms:gap:${seeded}`, `sms:day:${seeded}`);
    // 固定种子号的当日计数不清就会撞同号 10 次/日：这套断言一天能跑好几轮
    const sendSeeded = await req('POST', '/client/auth/sms/code', { phone: seeded });
    check('已注册号码发码成功', '0', codeOf(sendSeeded));
    // 只比 code 与文案：信封里的 timestamp / requestId 每次都不同
    check('两种号码的回话一字不差', 'true', String(
      sendFresh.json.code === sendSeeded.json.code && sendFresh.json.message === sendSeeded.json.message,
    ));

    /* ---------- 2. 验证码本体与节流 ---------- */
    console.log('\n[2] 验证码与发送节流');
    await redis.del(`sms:gap:${fresh}`, `sms:code:${fresh}`);
    const issued = await issueCode(fresh);
    check('验证码是 6 位数字', 'true', /^\d{6}$/.test(issued.code));

    const second = await req('POST', '/client/auth/sms/code', { phone: fresh });
    check('60 秒内重发被拒', 'false', String(codeOf(second) === '0'));
    check('拒的时候告诉还要等多久', 'true', String(/秒后再试/.test(msgOf(second))));

    /* ---------- 3. 错码累加与作废 ---------- */
    console.log('\n[3] 错码上限');
    let lastWrong = null;
    let wrongAt5 = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastWrong = await req('POST', '/client/auth/sms/login', {
        phone: fresh,
        code: issued.code === '000000' ? '111111' : '000000',
        merchantCode: MERCHANT,
      });
      if (attempt === 4) wrongAt5 = lastWrong;
    }
    check('第 5 次错仍只说「不正确」', 'true', String(/验证码不正确/.test(msgOf(wrongAt5))));
    check('第 6 次说「错误次数过多」（错满 5 次即作废）', 'true', String(/错误次数过多/.test(msgOf(lastWrong))));

    const afterBurn = await req('POST', '/client/auth/sms/login', {
      phone: fresh,
      code: issued.code,
      merchantCode: MERCHANT,
    });
    check('作废之后连正确码也不认', 'true', String(/过期|重新获取/.test(msgOf(afterBurn))));

    /* ---------- 4. 未注册号码登录即建档 ---------- */
    console.log('\n[4] 未注册号码自动建档登录');
    await redis.del(`sms:gap:${fresh}`, `sms:code:${fresh}`);
    const reissued = await issueCode(fresh);
    const login = await req('POST', '/client/auth/sms/login', {
      phone: fresh,
      code: reissued.code,
      merchantCode: MERCHANT,
    });
    check('正确验证码可登录', '0', codeOf(login));
    const loginData = dataOf(login) || {};
    check('拿到顾客令牌', 'true', String(Boolean(loginData.accessToken)));
    check('新档案标记为首次入店', 'true', String(loginData.isNewMember));
    check('脱敏手机号已回显', fresh.slice(0, 3) + '****' + fresh.slice(-4), loginData.member.phoneMasked);
    check('验证码登录不带微信身份时提示为空', 'null', String(loginData.phoneNote));

    const [rows] = await db.query('SELECT id, openid FROM customer WHERE phone = ?', [fresh]);
    check('库里只有一条该号码的身份', 1, rows.length);
    check('验证码登录不绑微信身份', 'null', String(rows[0].openid));
    createdCustomerIds.push(rows[0].id);

    /* ---------- 5. 验证码一次性 ---------- */
    console.log('\n[5] 验证码一次性');
    const replay = await req('POST', '/client/auth/sms/login', {
      phone: fresh,
      code: reissued.code,
      merchantCode: MERCHANT,
    });
    check('同一个码用第二次就失败', 'true', String(/过期|重新获取/.test(msgOf(replay))));

    /* ---------- 6. 认领商家导入的历史会员 ---------- */
    console.log('\n[6] 认领无微信身份的历史会员');
    const legacyPhone = testPhone();
    phones.push(legacyPhone);
    const inserted = await db.query(
      `INSERT INTO customer (created_at, updated_at, nickname, phone, gender, status, register_source)
       VALUES (NOW(), NOW(), '冒烟老会员', ?, 'unknown', 'active', 'import')`,
      [legacyPhone],
    );
    const legacyId = inserted[0].insertId;
    createdCustomerIds.push(legacyId);
    await db.query(
      `INSERT INTO member (created_at, updated_at, merchant_id, customer_id, level, growth_value,
        points, balance, total_amount, order_count, status, register_source)
       VALUES (NOW(), NOW(), ?, ?, 'silver', 2590, 300, 128.50, 0, 0, 'active', 'import')`,
      [1, legacyId],
    );

    await redis.del(`sms:gap:${legacyPhone}`);
    const legacyIssued = await issueCode(legacyPhone);
    const legacyLogin = await req('POST', '/client/auth/sms/login', {
      phone: legacyPhone,
      code: legacyIssued.code,
      merchantCode: MERCHANT,
    });
    check('历史会员可登录', '0', codeOf(legacyLogin));
    const legacyData = dataOf(legacyLogin) || {};
    // 等级只由 growth_value 反推（levelByGrowth），2590 落在银卡档
    check('等级沿用原有档案', '银卡会员', legacyData.member.levelLabel);
    check('成长值沿用原有档案', 2590, legacyData.member.growthValue);
    check('余额沿用原有档案', '128.5', String(legacyData.member.balance));
    check('不算首次入店', 'false', String(legacyData.isNewMember));

    const [legacyRows] = await db.query('SELECT id FROM customer WHERE phone = ?', [legacyPhone]);
    check('没有长出第二条同手机号身份', 1, legacyRows.length);
    check('登录用的还是那条历史身份', legacyId, legacyData.member.customerId);

    /* ---------- 8. 平台端短信配置（改写 sms_config，finally 里原样还原）---------- */
    console.log('\n[8] 平台端短信配置');
    const snapshot = (await db.query('SELECT * FROM sms_config WHERE slot = ?', ['global']))[0];
    smsRowBefore = snapshot[0] ?? null;
    smsConfigSnapshotTaken = true;

    const admin = await req('POST', '/auth/platform/login', {
      username: 'admin',
      password: 'Admin@123456',
    });
    check('超管可登录平台端', '0', codeOf(admin));
    const P = dataOf(admin).accessToken;
    const operator = await req('POST', '/auth/platform/login', {
      username: 'operator',
      password: 'Operator@123456',
    });
    const O = dataOf(operator).accessToken;

    const read = await req('GET', '/platform/sms-config', null, P);
    check('超管可读短信配置', '0', codeOf(read));
    check('开发环境允许日志通道', 'true', String(dataOf(read).logAllowed));
    // 与「小程序配置」相反：运营要能看顾客收不收得到验证码，所以给读、不给写
    check('运营可读短信配置', '0', codeOf(await req('GET', '/platform/sms-config', null, O)));
    check('运营不可写短信配置', '403', codeOf(await req('PUT', '/platform/sms-config', { enabled: false }, O)));

    const asLog = dataOf(
      await req('PUT', '/platform/sms-config', { enabled: true, driver: 'log' }, P),
    );
    check('保存后凭据来源切到数据库', 'database', asLog.source);
    const logProbe = await req('POST', '/platform/sms-config/test', null, P);
    check('日志通道自检通过', 'true', String(dataOf(logProbe).ok));
    check('自检带检测时间', 'true', String(Boolean(dataOf(logProbe).checkedAt)));

    const FAKE_SECRET = 'smoke-secret-value-1';
    await req(
      'PUT',
      '/platform/sms-config',
      {
        driver: 'aliyun',
        accessKeyId: 'LTAI-smoke-test',
        signName: '冒烟签名',
        templateCode: 'SMS_SMOKE_TEST',
        secrets: { accessKeySecret: FAKE_SECRET },
      },
      P,
    );
    const withSecret = dataOf(await req('GET', '/platform/sms-config', null, P));
    check('密钥只回掩码', '********', secretOf(withSecret, 'aliyun', 'accessKeySecret').masked);
    check(
      '已配置时给出指纹',
      'true',
      String(Boolean(secretOf(withSecret, 'aliyun', 'accessKeySecret').fingerprint)),
    );
    check('明文密钥永不出接口', 'false', String(JSON.stringify(withSecret).includes(FAKE_SECRET)));
    const cipherOf = async () =>
      (await db.query('SELECT access_key_secret_encrypted AS c FROM sms_config WHERE slot = ?', ['global']))[0][0].c;
    const cipherWritten = await cipherOf();
    check('密钥以密文入库', 'true', String(Boolean(cipherWritten) && !String(cipherWritten).includes(FAKE_SECRET)));

    // 前端把掩码原样写回来是常态（表单回填的就是掩码），这一步覆盖掉就等于把密钥清了
    await req('PUT', '/platform/sms-config', { signName: '冒烟签名2', secrets: { accessKeySecret: '********' } }, P);
    check('回传掩码不会覆盖密钥', 'true', String((await cipherOf()) === cipherWritten));

    await req('PUT', '/platform/sms-config', { secrets: { accessKeySecret: '' } }, P);
    check('空串才是清除', 'null', String(await cipherOf()));
    check(
      '清除后标记为未配置',
      'false',
      String(secretOf(dataOf(await req('GET', '/platform/sms-config', null, P)), 'aliyun', 'accessKeySecret').configured),
    );

    const halfSaved = await req('PUT', '/platform/sms-config', { templateCode: '' }, P);
    check('缺凭据也允许保存（可以先存半成品）', '0', codeOf(halfSaved));
    const half = dataOf(halfSaved);
    check('但状态标为未就绪并列出缺项', 'true', String(half.missingFields.includes('验证码模板 CODE')));
    const halfProbe = dataOf(await req('POST', '/platform/sms-config/test', null, P));
    check('未就绪时自检不去请求厂商、直接说缺什么', 'true', String(/缺少必填配置/.test(halfProbe.message)));

    const blockedPhone = testPhone();
    phones.push(blockedPhone);
    const blocked = await req('POST', '/client/auth/sms/code', { phone: blockedPhone });
    check('配置未就绪时发码不报 500', '400', blocked.status);
    check('给顾客一条能照做的提示', 'true', String(/一键登录/.test(msgOf(blocked))));

    await req('PUT', '/platform/sms-config', { enabled: false, driver: 'log', templateCode: 'SMS_SMOKE_TEST' }, P);
    const off = await req('POST', '/client/auth/sms/code', { phone: blockedPhone });
    check('总开关关掉后发码直接拒', '400', off.status);
    check('拒的时候说明是「未开启」', 'true', String(/未开启/.test(msgOf(off))));

    /* ---------- 9. 腾讯云通道：与阿里云共用同一列密钥，但措辞与必填项跟着通道走 ---------- */
    console.log('\n[9] 腾讯云通道凭据');
    const FAKE_TENCENT = 'smoke-tencent-secret-2';
    const tencent = dataOf(
      await req(
        'PUT',
        '/platform/sms-config',
        {
          enabled: false,
          driver: 'tencent',
          accessKeyId: 'AKID-smoke-test',
          sdkAppId: '1400000999',
          signName: '冒烟签名',
          templateCode: '2000999',
          secrets: { accessKeySecret: FAKE_TENCENT },
        },
        P,
      ),
    );
    check('同一个密钥字段在腾讯云下按厂商原文叫 SecretKey', 'SecretKey（云 API 密钥）', secretOf(tencent, 'tencent', 'accessKeySecret').label);
    check('同一个密钥字段在阿里云下仍叫 AccessKey Secret', 'AccessKey Secret', secretOf(tencent, 'aliyun', 'accessKeySecret').label);
    check('腾讯云必填项多出 SdkAppId', 'true', String(metaOf(tencent, 'tencent').requiredFields?.includes('sdkAppId')));
    check('阿里云必填项里没有 SdkAppId', 'false', String(metaOf(tencent, 'aliyun').requiredFields?.includes('sdkAppId')));
    check('腾讯云密钥同样以密文写入同一列', 'true', String(!String(await cipherOf()).includes(FAKE_TENCENT)));
    check('明文密钥不出接口', 'false', String(JSON.stringify(tencent).includes(FAKE_TENCENT)));

    const missingSdk = dataOf(await req('PUT', '/platform/sms-config', { sdkAppId: '' }, P));
    check('缺 SdkAppId 时列为未就绪', 'true', String(missingSdk.missingFields.includes('短信应用 SdkAppId')));
    check('但界面措辞用的是厂商原文而不是字段名', 'false', String(missingSdk.missingFields.includes('sdkAppId')));

    /* ---------- 10. 自定义短信网关：把整条链路打到本机桩上 ---------- */
    console.log('\n[10] 自定义短信网关端到端');
    gateway = await startEchoGateway(Number(process.env.SMOKE_GATEWAY_PORT || 18099));
    const gatewayUrl = `http://127.0.0.1:${Number(process.env.SMOKE_GATEWAY_PORT || 18099)}/sms`;
    const CUSTOM_TOKEN = 'smoke-custom-token';

    const asCustom = dataOf(
      await req(
        'PUT',
        '/platform/sms-config',
        {
          enabled: true,
          driver: 'custom',
          endpoint: gatewayUrl,
          signName: '冒烟签名',
          customAuthHeader: 'X-Sms-Token: Bearer {token}',
          customBodyTemplate: '{"mobile":"{phone}","captcha":"{code}","sign":"{signName}"}',
          secrets: { customToken: CUSTOM_TOKEN },
        },
        P,
      ),
    );
    check('自定义通道的密钥字段是网关密钥', '网关密钥', secretOf(asCustom, 'custom', 'customToken').label);
    check('网关密钥密文入库', 'true', String(
      !String((await db.query('SELECT custom_token_encrypted AS c FROM sms_config WHERE slot = ?', ['global']))[0][0].c).includes(CUSTOM_TOKEN),
    ));
    const customProbe = dataOf(await req('POST', '/platform/sms-config/test', null, P));
    check('自定义通道自检通过', 'true', String(customProbe.ok));
    check('自检说明不真发、要实收一条', 'true', String(/实收一条/.test(customProbe.message)));
    check('自检没真打网关', 'null', String(gateway.last));

    const customPhone = testPhone();
    phones.push(customPhone);
    const customSent = await req('POST', '/client/auth/sms/code', { phone: customPhone });
    check('走自定义网关能发码', '0', codeOf(customSent));
    const hit = gateway.last;
    check('网关收到 POST', 'POST', hit?.method);
    check('手机号按模板渲染', customPhone, String(hit?.body?.mobile));
    const cachedCode = JSON.parse(await redis.get(`sms:code:${customPhone}`));
    check('验证码按模板渲染且与缓存一致', cachedCode.value, String(hit?.body?.captcha));
    check('签名占位符可用', '冒烟签名', String(hit?.body?.sign));
    check('{token} 换成密钥后放进鉴权头', `Bearer ${CUSTOM_TOKEN}`, String(hit?.headers?.['x-sms-token']));
    check('请求体按 JSON 提交', 'application/json', String(hit?.headers?.['content-type']));
    const customLogin = await req('POST', '/client/auth/sms/login', {
      phone: customPhone,
      code: cachedCode.value,
      merchantCode: MERCHANT,
    });
    check('用自定义通道收到的验证码能登录', '0', codeOf(customLogin));
    const customCustomerId = dataOf(customLogin)?.member?.customerId;
    if (customCustomerId) {
      createdCustomerIds.push(customCustomerId);
    }

    gateway.reply(503, { error: 'quota exceeded' });
    const failedPhone = testPhone();
    phones.push(failedPhone);
    const failed = await req('POST', '/client/auth/sms/code', { phone: failedPhone });
    check('网关非 2xx 算发送失败（与云厂商通道一样计 502）', '502', failed.status);
    check('把网关回话摘要报给调用方', 'true', String(/503/.test(msgOf(failed))));
    gateway.reply(200, { code: 0 });
    const retried = await req('POST', '/client/auth/sms/code', { phone: failedPhone });
    check('发送失败不占用顾客的重发额度', '0', codeOf(retried));

    const badTemplate = await req('PUT', '/platform/sms-config', { customBodyTemplate: '{"mobile":"{phone}"}' }, P);
    check('模板缺 {code} 当场被拒', '400', codeOf(badTemplate));
    check('拒的时候说清缺哪个占位符', 'true', String(/缺少占位符/.test(msgOf(badTemplate))));
    const notJson = await req('PUT', '/platform/sms-config', { customBodyTemplate: 'mobile={phone}&captcha={code}' }, P);
    check('模板不是 JSON 当场被拒', '400', codeOf(notJson));
    const badEndpoint = await req('PUT', '/platform/sms-config', { endpoint: '127.0.0.1:18099' }, P);
    check('网关地址缺协议当场被拒', '400', codeOf(badEndpoint));
    const badHeader = await req('PUT', '/platform/sms-config', { customAuthHeader: 'X-Sms-Token' }, P);
    check('鉴权头缺冒号分隔当场被拒', '400', codeOf(badHeader));
    check('被拒的这几次没改动配置', gatewayUrl, String(dataOf(await req('GET', '/platform/sms-config', null, P)).endpoint));

    await req('PUT', '/platform/sms-config', { enabled: false, driver: 'log' }, P);

  } finally {
    /* ---------- 清理 ---------- */
    console.log('\n清理测试数据');
    if (gateway) {
      await gateway.close();
    }
    for (const phone of phones) {
      await redis.del(
        `sms:code:${phone}`,
        `sms:gap:${phone}`,
        `sms:day:${phone}`,
        `sms:ip:${'127.0.0.1'}`,
      );
    }
    if (createdCustomerIds.length) {
      // member 的外键是 CASCADE，删身份即删档案；订单与券只挂在 member 上，测试身份没有
      await db.query('DELETE FROM customer WHERE id IN (?)', [createdCustomerIds]);
    }
    const left = phones.length
      ? (await db.query('SELECT id FROM customer WHERE phone IN (?)', [phones]))[0]
      : [];
    check('测试手机号的身份已清空', 0, left.length);

    // 第 8 段动的是真表：按快照原样写回（连 id、密文带回来），再清掉 60 秒的生效缓存
    if (smsConfigSnapshotTaken) {
      await db.query('DELETE FROM sms_config');
      if (smsRowBefore) {
        const cols = Object.keys(smsRowBefore);
        await db.query(
          `INSERT INTO sms_config (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((col) => smsRowBefore[col]),
        );
      }
      await redis.del('sms:config');
      const [restored] = await db.query('SELECT COUNT(*) AS n FROM sms_config');
      check('sms_config 已还原为测试前的样子', smsRowBefore ? 1 : 0, restored[0].n);
    }

    await db.end();
    redis.disconnect();
  }

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) {
    console.log('失败项：');
    for (const name of fails) console.log(`  - ${name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('冒烟脚本异常：', error.message || error);
  process.exit(1);
});
