import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ObjectStorageDriver } from './object-storage.interface';

/**
 * 本地磁盘驱动（单机部署 / 本地开发）。
 *
 * URL 手工拼斜杠而不是用 path.join：后者在 Windows 上给出反斜杠，
 * 那串东西进了 HTTP 路径就是 404。
 */
export class LocalStorageDriver implements ObjectStorageDriver {
  readonly kind = 'local' as const;

  constructor(private readonly root: string) {}

  get staticDir(): string {
    return this.root;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = join(this.root, ...key.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  urlFor(key: string): string {
    return `/uploads/${key}`;
  }
}
