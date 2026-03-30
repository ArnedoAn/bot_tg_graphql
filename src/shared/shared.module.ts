import { Module } from '@nestjs/common';
import { BotService } from './instances/bot.service';
import { UserMenuModeService } from './instances/user-menu-mode.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [BotService, UserMenuModeService],
  exports: [BotService, UserMenuModeService, PrismaModule],
})
export class SharedModule {}
