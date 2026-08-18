import type { Logger } from './logger.js';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

export async function runBoundedShutdown(
  logger: Logger,
  signal: string,
  work: () => Promise<void>,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
  logger.info('Shutting down.', { signal, event: 'shutdown_start' });
  const timer = setTimeout(() => {
    logger.error('Shutdown exceeded platform grace window.', {
      signal,
      event: 'shutdown_timeout',
      timeoutMs,
    });
    process.exit(1);
  }, timeoutMs);
  timer.unref?.();
  try {
    await work();
    clearTimeout(timer);
    logger.info('Shutdown complete.', { signal, event: 'shutdown_complete' });
    process.exit(0);
  } catch (error) {
    clearTimeout(timer);
    logger.error('Shutdown failed.', {
      signal,
      event: 'shutdown_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}
