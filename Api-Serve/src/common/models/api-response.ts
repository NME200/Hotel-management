export interface ApiResponse<T> {
  /** 0 表示成功，其余为 HTTP 语义状态码 */
  code: number;
  message: string;
  data: T;
  timestamp: number;
  requestId: string;
  errors?: string[];
}
