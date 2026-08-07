import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

/** Exam payloads are a single answer at a time — small by design. */
const MAX_BODY_SIZE = '256kb';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const isProd = process.env.NODE_ENV === 'production';

  // The exam service also sits behind a proxy; without this every request looks
  // like it came from the load balancer.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 1);

  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.removeHeader('X-Powered-By');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.useBodyParser('json', { limit: MAX_BODY_SIZE });

  // Requests now carry a bearer token, so `origin: '*'` is no longer acceptable:
  // in production only the configured origins may call this service.
  const allowList = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (isProd && !allowList.length) {
    throw new Error(
      'FATAL: set CORS_ORIGINS (or FRONTEND_URL) in production — refusing to start with no allow-list.',
    );
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowList.includes(origin)) return callback(null, true);
      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // Without this, an unhandled Postgres or PostgREST error was serialised to the
  // caller with its internal message intact.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Let an in-flight submit finish on a rolling deploy.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3001; // 3001 so it doesn't clash with the main backend
  await app.listen(port);
  logger.log(`Secure exam service running on port ${port}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start:', e);
  process.exit(1);
});
