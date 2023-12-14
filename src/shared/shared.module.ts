import { Module } from '@nestjs/common';
import { BotInstance } from './instances/bot.instance';
import { PrismaService } from './services/prisma.service';

@Module({
  providers: [BotInstance, PrismaService],
  exports: [BotInstance, PrismaService],
})
export class SharedModule {}
