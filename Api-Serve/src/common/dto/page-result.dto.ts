export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function buildPageResult<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return { list, total, page, pageSize };
}
