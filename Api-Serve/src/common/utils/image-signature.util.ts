/**
 * 按文件真实字节判断图片类型。
 *
 * 不看扩展名、也不看客户端给的 mimetype：两者都是调用方说了算的，
 * 攻击者把脚本改名成 .jpg 就能上传成功。商户图片只允许这四种，
 * 认不出来的一律拒绝。
 */

export type ImageExtension = 'jpg' | 'png' | 'gif' | 'webp';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Buffer, header: number[], offset = 0): boolean {
  if (bytes.length < offset + header.length) {
    return false;
  }
  return header.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Buffer, offset: number, length: number): string {
  if (bytes.length < offset + length) {
    return '';
  }
  return bytes.subarray(offset, offset + length).toString('ascii');
}

/** 返回真实扩展名；不是可接受的图片时返回 null。 */
export function sniffImage(bytes: Buffer): ImageExtension | null {
  if (startsWith(bytes, PNG_HEADER)) {
    return 'png';
  }
  // JPEG 以 FF D8 FF 开头，后面跟的是各家的标记字节，不必再往下认
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'jpg';
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return 'gif';
  }
  // WEBP 是 RIFF 容器：前 4 字节 RIFF、8-11 字节 WEBP，中间是小端长度
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  return null;
}
