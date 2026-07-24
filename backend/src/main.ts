import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow frontend to call the backend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
