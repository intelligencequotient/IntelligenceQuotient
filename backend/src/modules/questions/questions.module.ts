import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { PdfProcessorService } from './pdf-processor.service';
import { UploadsGateway } from './uploads.gateway';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    // Store uploaded files in memory (no disk I/O needed for CSV parsing).
    // The limit matches the 5 MB the UI advertises — without it a huge upload
    // would be buffered entirely before any handler could reject it.
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService, PdfProcessorService, UploadsGateway],
})
export class QuestionsModule {}
