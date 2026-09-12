import { Module } from '@nestjs/common';
import { TranscaribeService } from './transcaribe.service';
import { TranscaribeHandler } from './handlers/transcaribe.handler';
import { SharedModule } from '../shared/shared.module';

@Module({
  providers: [TranscaribeService, TranscaribeHandler],
  exports: [TranscaribeHandler],
  imports: [SharedModule],
})
export class TranscaribeModule {}
