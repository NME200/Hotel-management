/**
 * 图片存储驱动。
 *
 * 抽出这一层是因为「图片放哪」和「图片怎么校验、怎么命名」是两件事：
 * 前者随部署形态变（单机写磁盘、多副本写对象存储），后者是稳定的业务规则。
 * 分开之后换存储只换驱动，上传的校验、命名、返回结构都不动。
 */
export interface ObjectStorageDriver {
  readonly kind: 'local' | 's3';

  /**
   * 写入一个对象。
   *
   * @param key 形如 `2026/10/a1b2c3.jpg`，不含 `/uploads` 前缀，
   *            保证本地与对象存储两种驱动下的相对结构一致
   */
  put(key: string, body: Buffer, contentType: string): Promise<void>;

  /**
   * key 对应的可访问地址，直接写进数据库。
   *
   * 本地驱动给 `/uploads/...` 相对路径（换域名不用洗数据）；
   * 对象存储驱动给绝对地址（图不在本机，前端也无法再拼前缀）。
   */
  urlFor(key: string): string;

  /** 本地驱动的静态根目录；对象存储驱动为 null，由网关/CDN 承接 */
  readonly staticDir: string | null;
}
