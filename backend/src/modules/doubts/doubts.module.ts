import { Module } from '@nestjs/common';
import { DoubtsController } from './doubts.controller';
import { DoubtsService } from './doubts.service';
import { DoubtsGateway } from './doubts.gateway';

@Module({
  controllers: [DoubtsController],
  providers: [DoubtsService, DoubtsGateway],
})
export class DoubtsModule {}
