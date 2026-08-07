import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';

/**
 * Liveness and readiness probes.
 *
 * Container health checks used to hit `/api/docs`, which meant Swagger had to
 * stay mounted in production purely so the orchestrator could tell whether the
 * process was alive. This endpoint returns no data, needs no auth, and is not
 * rate limited — a probe firing every 30 seconds must never be throttled.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('api/health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  liveness() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
