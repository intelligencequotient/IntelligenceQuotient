import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow frontend to call the backend
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl) or any localhost origin
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === process.env.FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  });

  // Auto-validate all incoming request bodies
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // Strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,       // Auto-convert strings to numbers etc.
    }),
  );

  // Return friendly error messages
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger API Documentation at http://localhost:3000/api/docs
  const config = new DocumentBuilder()
    .setTitle('EduCommand API')
    .setDescription('Backend API for EduCommand EdTech Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 EduCommand Backend running on http://localhost:${port}`);
  console.log(`📚 API Docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
