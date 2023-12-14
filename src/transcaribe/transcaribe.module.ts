import { Module } from '@nestjs/common';
import { TranscaribeService } from './transcaribe.service';
import { PrismaModule } from 'src/shared/prisma/prisma.module';

@Module({
  providers: [TranscaribeService],
  exports: [TranscaribeService],
  imports: [PrismaModule],
})
export class TranscaribeModule {}
