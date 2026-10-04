/**
 * SigV4 签名算法校验。
 *
 * 核心向量取自 AWS 官方 SigV4 测试套件 `get-vanilla`：
 * 密钥、日期、期望授权头都是公开且固定的，能真正证明实现与服务端算法一致，
 * 而不是「自己算的能对上自己」。
 *
 * 用法：pnpm build && node scripts/verify-sigv4.cjs
 */
const {
  signAwsV4,
  encodeS3Key,
  sha256Hex,
  EMPTY_PAYLOAD_SHA256,
} = require('../dist/modules/merchant/upload/storage/aws-v4-signer.js');

const SUITE_ACCESS_KEY = 'AKIDEXAMPLE';
const SUITE_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    期望: ${expected}`);
    console.log(`    实际: ${actual}`);
  }
}

// ---------- 1. AWS 官方测试套件向量（权威）----------
check(
  'AWS 官方测试套件 get-vanilla',
  signAwsV4({
    method: 'GET',
    canonicalUri: '/',
    headers: { host: 'example.amazonaws.com' },
    payloadHash: EMPTY_PAYLOAD_SHA256,
    accessKeyId: SUITE_ACCESS_KEY,
    secretAccessKey: SUITE_SECRET_KEY,
    region: 'us-east-1',
    service: 'service',
    date: new Date('2015-08-30T12:36:00Z'),
  }).authorization,
  'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
    'SignedHeaders=host;x-amz-date, ' +
    'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
);

// ---------- 2. 本项目上传所用的 S3 形态（回归锚点）----------
// 期望值由独立的 Python（hashlib/hmac）实现交叉验证过，防止后续改动悄悄破坏签名
const s3Body = Buffer.from('fake-image-bytes');
const s3PayloadHash = sha256Hex(s3Body);
check(
  'S3 PUT 形态（路径风格 + 缓存头 + 请求体哈希）',
  signAwsV4({
    method: 'PUT',
    canonicalUri: '/ye-dc-uploads/2026/10/a1b2c3.jpg',
    headers: {
      host: 'minio.example.com:9000',
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-amz-content-sha256': s3PayloadHash,
    },
    payloadHash: s3PayloadHash,
    accessKeyId: SUITE_ACCESS_KEY,
    secretAccessKey: SUITE_SECRET_KEY,
    region: 'us-east-1',
    service: 's3',
    date: new Date('2026-10-03T02:15:30Z'),
  }).authorization,
  'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261003/us-east-1/s3/aws4_request, ' +
    'SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, ' +
    'Signature=fa5751933f64e95cfad72a654cb467fcf77c28fec395080c14c24f58caf5bf77',
);

// ---------- 3. 对象键编码 ----------
for (const [input, expected] of [
  ['2026/10/a1b2c3.jpg', '2026/10/a1b2c3.jpg'],
  ['test$file.text', 'test%24file.text'],
  ["a b'c(d).txt", 'a%20b%27c%28d%29.txt'],
]) {
  check(`键编码 ${input}`, encodeS3Key(input), expected);
}

console.log(`\nSigV4 校验：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
