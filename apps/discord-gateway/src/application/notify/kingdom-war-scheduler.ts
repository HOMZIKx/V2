import { computeNotifyAt } from '../config/live-bot-config.js';
import type { KingdomWarConfig } from '../technika/capabilities.js';

/**
 * Skeleton: poll once per minute for kingdom war DM at notifyAt (Europe/Warsaw).
 * Timer ~1h reminder can hook the same loop later (needs timer end timestamps).
 */
export type KingdomWarSchedulerDeps = {
  readonly getKingdomWar: () => KingdomWarConfig;
  readonly onFire: (input: {
    readonly warAt: string;
    readonly notifyAt: string;
    readonly dayKey: string;
  }) => Promise<void>;
  readonly logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
  readonly intervalMs?: number;
};

function warsawHm(now = new Date()): { hhmm: string; dayKey: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hhmm = `${get('hour')}:${get('minute')}`;
  const dayKey = `${get('year')}-${get('month')}-${get('day')}`;
  return { hhmm, dayKey };
}

export class KingdomWarScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFiredDay: string | null = null;

  public constructor(private readonly deps: KingdomWarSchedulerDeps) {}

  public start(): void {
    if (this.timer) return;
    const ms = this.deps.intervalMs ?? 60_000;
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.deps.logger.warn('Kingdom war scheduler tick failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
    }, ms);
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      this.timer.unref();
    }
    this.deps.logger.info('Kingdom war scheduler started', { intervalMs: ms });
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick(now = new Date()): Promise<boolean> {
    const cfg = this.deps.getKingdomWar();
    if (!cfg.enabled) {
      return false;
    }
    const notifyAt = computeNotifyAt(cfg.warAt, cfg.notifyMinutesBefore);
    const { hhmm, dayKey } = warsawHm(now);
    if (hhmm !== notifyAt) {
      return false;
    }
    if (this.lastFiredDay === dayKey) {
      return false;
    }
    this.lastFiredDay = dayKey;
    await this.deps.onFire({ warAt: cfg.warAt, notifyAt, dayKey });
    return true;
  }
}
