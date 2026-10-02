import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildConfig } from '../config/configuration';
import { entities } from './entities';
import { SnakeNamingStrategy } from './naming-strategy';

const config = buildConfig();

// ts-node 走 src/*.ts，编译后走 dist/*.js；两个 glob 同时生效会被判定为重复迁移
const migrations = [
  join(__dirname, 'migrations', __filename.endsWith('.js') ? '*.js' : '*.ts'),
];

/** TypeORM CLI（生成/执行迁移）与 Nest 运行时共用的数据源定义。 */
const dataSource = new DataSource({
  type: 'mysql',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  charset: 'utf8mb4',
  timezone: 'local',
  entities,
  migrations,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: config.debug ? ['error', 'warn', 'migration'] : ['error'],
  poolSize: config.database.poolSize,
});

// TypeORM CLI 要求数据源文件只有一个 DataSource 导出
export default dataSource;
