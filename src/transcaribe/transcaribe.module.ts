import { Module } from '@nestjs/common';
import { TranscaribeService } from './transcaribe.service';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { TranscaribeHandler } from './handlers/transcaribe.handler';
import { SharedModule } from 'src/shared/shared.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  providers: [
    TranscaribeService,
    TranscaribeHandler,
  ],
  exports: [TranscaribeHandler],
  imports: [PrismaModule, SharedModule, HttpModule],
})
export class TranscaribeModule {}
