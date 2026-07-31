import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { PdfProcessorService } from './pdf-processor.service';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    // Store uploaded files in memory (no disk I/O needed for CSV parsing)
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService, PdfProcessorService],
})
export class QuestionsModule {}
