import { Module } from '@nestjs/common';
import { TranscaribeService } from './transcaribe.service';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { TranscaribeHandler } from './handlers/transcaribe.handler';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  providers: [TranscaribeService, TranscaribeHandler],
  exports: [TranscaribeHandler],
  imports: [PrismaModule, SharedModule],
})
export class TranscaribeModule {}
