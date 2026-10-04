import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { Permission } from '../../../common/constants/permission';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { UploadedImage, UploadFile } from './upload.service';
import { UploadService } from './upload.service';

/**
 * 装饰器在类定义时就求值，读不到注入进来的配置，
 * 所以这里只放一道硬上限兜住内存，真正生效的限制由服务按 UPLOAD_MAX_MB 再判一次。
 */
const HARD_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * 商家端图片上传。
 *
 * 菜品图、分类图、门店 Logo 三处共用这一个入口；返回的相对路径由前端回填到表单，
 * 随表单一起提交才进数据库——单独上传成功的图片不会改动任何业务数据。
 */
@ApiTags('商家端-图片上传')
@Controller('merchant/uploads')
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @Permissions(Permission.MediaUpload)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传一张图片，返回可存库的相对地址' })
  async upload(@UploadedFile() file: UploadFile): Promise<UploadedImage> {
    if (!file) {
      throw BusinessException.badRequest('请选择要上传的图片（表单字段名必须是 file）');
    }
    return this.uploads.saveImage(file);
  }
}
