/**
 * 生成一张真实可显示的 PNG（不靠扩展名糊弄）：冒烟要验证的是「按文件真实字节判类型」，
 * 所以测试素材本身必须是合法图片。
 */
const zlib = require('node:zlib');

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 纯色方块 PNG，宽=高=size，用于上传后在浏览器与小程序里真的能看见。 */
function makePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const rows = [];
  const raw = Buffer.alloc(1 + size * 3);
  raw[0] = 0;
  for (let x = 0; x < size; x += 1) {
    raw[1 + x * 3] = rgb[0];
    raw[2 + x * 3] = rgb[1];
    raw[3 + x * 3] = rgb[2];
  }
  for (let y = 0; y < size; y += 1) {
    rows.push(raw);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { makePng };
