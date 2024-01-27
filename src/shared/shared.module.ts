import { Module } from '@nestjs/common';
import { BotService } from './instances/bot.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  providers: [BotService],
  exports: [BotService],
  imports: [PrismaModule],
})
export class SharedModule {}
