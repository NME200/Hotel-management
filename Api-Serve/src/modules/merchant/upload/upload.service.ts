import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { sniffImage } from '../../../common/utils/image-signature.util';
import type { ConfigRoot } from '../../../config/configuration';
import type { ObjectStorageDriver } from './storage/object-storage.interface';
import { createStorageDriver } from './storage/storage.factory';

/** 上传接口收到的原始文件。这里自己声明而不是引 @types/multer——项目并未直接依赖 multer。 */
export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadedImage {
  /** 本地驱动为 /uploads/... 相对路径，对象存储为绝对地址；库里存的就是它 */
  url: string;
  size: number;
  mime: string;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * 图片上传。
 *
 * 这里只负责「校验 + 命名 + 交给存储驱动」，落盘还是进对象存储由驱动决定
 * （见 storage/）。库里只存相对路径或绝对地址，文件名一律重新生成不用商户给的名字——
 * 原名里可能带路径分隔符或非法字符。
 */
@Injectable()
export class UploadService {
  private readonly driver: ObjectStorageDriver;
  private readonly maxBytes: number;

  constructor(config: ConfigService<ConfigRoot, true>) {
    const upload = config.get('app', { infer: true }).upload;
    this.driver = createStorageDriver(upload);
    this.maxBytes = upload.maxMb * 1024 * 1024;
  }

  async saveImage(file: UploadFile | undefined): Promise<UploadedImage> {
    if (!file || !file.buffer?.length) {
      throw BusinessException.badRequest('没有收到图片文件');
    }
    if (file.buffer.length > this.maxBytes) {
      throw BusinessException.badRequest(
        `图片不能超过 ${Math.round(this.maxBytes / 1024 / 1024)} MB`,
      );
    }
    const ext = sniffImage(file.buffer);
    if (!ext) {
      throw BusinessException.badRequest('只支持 jpg / png / gif / webp 图片');
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = pad(now.getMonth() + 1);
    // 按月分目录：一家店上了几千张菜品图时，不至于把一个目录撑爆
    const key = `${year}/${month}/${randomBytes(12).toString('hex')}.${ext}`;

    await this.driver.put(key, file.buffer, MIME_BY_EXT[ext]);

    return {
      url: this.driver.urlFor(key),
      size: file.buffer.length,
      mime: MIME_BY_EXT[ext],
    };
  }

  /**
   * 保存一段由后端自己生成的图片字节（当前只有桌位小程序码）。
   *
   * 与 saveImage 的区别：这里不做签名嗅探——来源是微信接口而不是顾客上传，
   * 类型由调用方声明；单独分一个 qrcode/ 目录，便于按目录做清理或迁移。
   */
  async saveGeneratedImage(buffer: Buffer, ext: 'png' | 'jpg' = 'png'): Promise<UploadedImage> {
    if (!buffer.length) {
      throw BusinessException.badRequest('生成的图片内容为空');
    }
    const now = new Date();
    const key = `qrcode/${now.getFullYear()}/${pad(now.getMonth() + 1)}/${randomBytes(12).toString('hex')}.${ext}`;
    await this.driver.put(key, buffer, MIME_BY_EXT[ext]);
    return {
      url: this.driver.urlFor(key),
      size: buffer.length,
      mime: MIME_BY_EXT[ext],
    };
  }
}
