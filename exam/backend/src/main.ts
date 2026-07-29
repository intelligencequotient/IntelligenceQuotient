import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: '*', // For dev
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  
  await app.listen(3001); // Run on 3001 so it doesn't clash with main backend on 3000
}
bootstrap();
