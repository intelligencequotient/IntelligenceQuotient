import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RedisIoAdapter } from './common/websockets/redis-io.adapter';

/**
 * Request body ceiling. Nest's default is 100 KB, which a CSV bulk-confirm of a
 * few hundred questions exceeds; 2 MB covers that with room to spare while still
 * bounding what a single request can make the process allocate.
 */
const MAX_BODY_SIZE = '2mb';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });

  const isProd = process.env.NODE_ENV === 'production';

  // ── Behind a proxy ─────────────────────────────────────────────────────────
  // nginx / the load balancer terminates TLS and forwards X-Forwarded-For.
  // Without this, `req.ip` is the proxy for every request, so rate limiting
  // buckets the entire cohort together and access logs are useless.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 1);

  // ── Security headers ───────────────────────────────────────────────────────
  // The API serves JSON to a separate origin, so the useful set is small and
  // hand-rolled rather than pulling in another dependency.
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // Nothing here is ever a document; stop a response being framed or sniffed
    // into one.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.removeHeader('X-Powered-By');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.useBodyParser('json', { limit: MAX_BODY_SIZE });
  app.useBodyParser('urlencoded', { limit: MAX_BODY_SIZE, extended: true });

  // ── CORS ───────────────────────────────────────────────────────────────────
  // In development any localhost port is fine (Vite moves ports around); in
  // production only the explicitly configured origins are allowed.
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
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin) return callback(null, true);

      if (allowList.includes(origin)) return callback(null, true);

      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
  });

  // ── WebSockets ─────────────────────────────────────────────────────────────
  // Socket.IO keeps its room membership in the process that owns the connection.
  // With more than one replica behind a load balancer, a message published on
  // one instance never reaches subscribers connected to another — so doubt chat
  // and upload progress silently stop working the moment the API scales out.
  // The Redis adapter fans events out across instances; it no-ops without
  // REDIS_URL, which is correct for a single-instance deployment.
  const ioAdapter = new RedisIoAdapter(app, allowList, isProd);
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  // Auto-validate all incoming request bodies
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown fields
      forbidNonWhitelisted: true,
      transform: true, // Auto-convert strings to numbers etc.
      transformOptions: { enableImplicitConversion: false },
      // Validation messages describe the request, not the internals — safe to
      // return, and the frontend surfaces them directly.
      validationError: { target: false, value: false },
    }),
  );

  // Return friendly error messages
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── API docs ───────────────────────────────────────────────────────────────
  // Off in production by default: it enumerates every route and payload shape,
  // which is a free map of the attack surface. Set ENABLE_SWAGGER=true to
  // re-enable it deliberately (e.g. on a staging deployment).
  const enableSwagger = process.env.ENABLE_SWAGGER === 'true' || !isProd;
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('EduCommand API')
      .setDescription('Backend API for EduCommand EdTech Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Give in-flight exam submissions a chance to finish on a rolling deploy.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`EduCommand Backend running on port ${port}`);
  logger.log(`Health probe at /api/health${enableSwagger ? ' · API docs at /api/docs' : ''}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start:', e);
  process.exit(1);
});
