import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/**
 * 图片上传与存储。
 *
 * 导出 UploadService 是为了让桌位模块能把生成好的小程序码 PNG 落进同一个存储：
 * 换本地磁盘还是对象存储由 `UPLOAD_DRIVER` 决定，两个调用方都不用关心。
 */
@Module({
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
