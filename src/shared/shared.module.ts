import { Module } from '@nestjs/common';
import { BotInstance } from './instances/bot.instance';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  providers: [BotInstance],
  exports: [BotInstance],
  imports: [PrismaModule],
})
export class SharedModule {}
