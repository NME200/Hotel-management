import { resolve } from 'node:path';
import type { UploadSettings } from '../../../../config/configuration';
import { LocalStorageDriver } from './local-storage.driver';
import type { ObjectStorageDriver } from './object-storage.interface';
import { S3StorageDriver } from './s3-storage.driver';

/**
 * 按配置选存储驱动。
 *
 * `configuration.ts` 已经保证 driver=s3 时 s3 配置齐全，这里的判断只是把
 * 类型上的可空收窄成非空，同时兜住「有人绕过配置直接构造」的情况。
 */
export function createStorageDriver(upload: UploadSettings): ObjectStorageDriver {
  if (upload.driver === 's3') {
    if (!upload.s3) {
      throw new Error('UPLOAD_DRIVER=s3 但缺少 S3 配置，请检查启动配置');
    }
    return new S3StorageDriver(upload.s3);
  }
  return new LocalStorageDriver(resolve(upload.dir));
}
