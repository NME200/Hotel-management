/**
 * 关键字搜索统一走 LIKE，这里转义用户输入里的通配符，
 * 避免搜 `%` 或 `_` 时把整表捞出来。
 */
export function likePattern(keyword: string): string {
  const escaped = keyword.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
