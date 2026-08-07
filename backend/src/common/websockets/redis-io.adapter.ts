import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that fans events out through Redis when one is configured.
 *
 * Rooms live in the memory of whichever process owns the connection. With a
 * single instance that is fine; behind a load balancer running several replicas
 * it is not — a teacher's reply emitted on replica A never reaches the student
 * whose socket is held by replica B, so doubt chat and upload progress appear to
 * work for some pairs of users and silently fail for others.
 *
 * Also the single place the gateway CORS allow-list is applied. Both gateways
 * previously hard-coded `origin: process.env.FRONTEND_URL || 'http://localhost:5173'`,
 * which ignored CORS_ORIGINS entirely and defaulted to a port the app is not
 * even served on.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly allowList: string[],
    private readonly isProd: boolean,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — WebSocket events stay within this instance.');
      return;
    }

    try {
      const pubClient = new Redis(url, { maxRetriesPerRequest: null });
      const subClient = pubClient.duplicate();
      this.clients = [pubClient, subClient];

      // Surface connection trouble rather than letting ioredis retry silently
      // while messages quietly fail to cross instances.
      for (const client of this.clients) {
        client.on('error', (e) => this.logger.warn(`Redis socket adapter error: ${e.message}`));
      }

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('WebSocket Redis adapter enabled.');
    } catch (e: any) {
      this.logger.error(
        `Could not set up the WebSocket Redis adapter (${e?.message}). ` +
          'Running single-instance; do not scale the API out until this is fixed.',
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
          if (!origin) return callback(null, true);
          if (this.allowList.includes(origin)) return callback(null, true);
          if (!this.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
          }
          return callback(new Error(`Origin ${origin} is not allowed by CORS`));
        },
        credentials: true,
      },
    });

    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  async close(server: any): Promise<void> {
    await super.close?.(server);
    await Promise.all(
      this.clients.map((c) =>
        c.quit().catch(() => {
          c.disconnect();
        }),
      ),
    );
    this.clients = [];
  }
}
