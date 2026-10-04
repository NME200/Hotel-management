import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiniProgramConfig } from '../../../database/entities/mini-program-config.entity';
import { MiniProgramConfigService } from './mini-program-config.service';

/**
 * 小程序凭据（AppID / AppSecret）。
 *
 * 单独成模块是因为它有两个消费方，且不在同一个域里：
 * 顾客端登录（ClientModule）与商家端生成桌位小程序码（TableModule）。
 * 抽出来之后谁都不用去 import 对方的整个模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([MiniProgramConfig])],
  providers: [MiniProgramConfigService],
  exports: [MiniProgramConfigService],
})
export class MiniProgramConfigModule {}
