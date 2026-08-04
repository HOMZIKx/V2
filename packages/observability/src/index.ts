export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export function createLogger(serviceName: string): Logger {
  const write = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
  ) => {
    const entry = {
      level,
      message,
      service: serviceName,
      timestamp: new Date().toISOString(),
      ...(context === undefined ? {} : { context }),
    };

    console[level](JSON.stringify(entry));
  };

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  };
}
