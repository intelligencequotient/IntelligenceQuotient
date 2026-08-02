import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AttemptsService } from './attempts.service';

/**
 * Periodically finalises attempts whose exam window has elapsed.
 *
 * Without this, a student who closes the tab when the timer runs out leaves the
 * attempt stuck in `in_progress` forever — never graded, never on the leaderboard.
 * The sweep is idempotent: an attempt that is already submitted is skipped.
 *
 * Interval is configurable via ATTEMPT_SWEEP_INTERVAL_MS (default 60s).
 * Set ATTEMPT_SWEEP_DISABLED=true to turn it off (e.g. in tests).
 */
@Injectable()
export class AttemptsSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttemptsSweeperService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly attemptsService: AttemptsService) {}

  onModuleInit() {
    if (process.env.ATTEMPT_SWEEP_DISABLED === 'true') {
      this.logger.log('Attempt sweeper disabled via ATTEMPT_SWEEP_DISABLED.');
      return;
    }

    const intervalMs = Number(process.env.ATTEMPT_SWEEP_INTERVAL_MS) || 60_000;
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    // Do not hold the event loop open just for the sweeper.
    this.timer.unref?.();
    this.logger.log(`Attempt sweeper started (every ${intervalMs}ms).`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Guarded so a slow sweep can never overlap with the next tick. */
  async sweep(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.attemptsService.autoSubmitExpiredAttempts();
    } catch (e: any) {
      this.logger.error(`Sweep failed: ${e?.message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
