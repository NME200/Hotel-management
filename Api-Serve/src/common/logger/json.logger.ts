import type { LoggerService, LogLevel } from '@nestjs/common';

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * 生产环境的 JSON 行日志。
 *
 * 云平台的日志采集器按行解析、按字段建索引，多行堆栈和自定义格式会被拆得七零八落，
 * 所以这里每条日志固定输出一行 JSON。开发环境仍用 Nest 默认的可读格式，
 * 避免本地调试时盯着一屏转义字符。
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly serviceName = 'Api-Serve') {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  setLogLevels?(_levels: LogLevel[]): void {
    // 由 Nest 在启动时调用；本实现不额外做级别过滤，交给编排层的日志级别控制
  }

  private write(level: Level, message: unknown, params: unknown[]): void {
    // Nest 的约定是「上下文」作为最后一个字符串参数传入，其余参数是附加信息
    let context: string | undefined;
    const extras: unknown[] = [...params];
    const last = extras[extras.length - 1];
    if (typeof last === 'string') {
      context = last;
      extras.pop();
    }

    const record: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      service: this.serviceName,
      ...(context ? { context } : {}),
      message: typeof message === 'string' ? message : safeStringify(message),
    };

    // error 的第二参通常是堆栈字符串，单独成字段便于日志平台聚合
    const stack = extras.find((item) => typeof item === 'string' && item.includes('\n'));
    if (stack) {
      record.stack = stack;
    }
    const others = extras.filter((item) => item !== stack);
    if (others.length > 0) {
      record.detail = others.map((item) => (typeof item === 'string' ? item : safeStringify(item)));
    }

    const line = safeStringify(record);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}

/** 日志永远不能因为序列化失败而把业务流程带崩，所以兜底成字符串 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
