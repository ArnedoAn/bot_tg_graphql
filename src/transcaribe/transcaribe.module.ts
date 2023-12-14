import { Module } from '@nestjs/common';
import { TranscaribeService } from './transcaribe.service';

@Module({
  providers: [TranscaribeService],
})
export class TranscaribeModule {}
