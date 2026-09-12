import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { TelegramModule } from './telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TranscaribeModule } from './transcaribe/transcaribe.module';
import { PicoyplacaModule } from './picoyplaca/picoyplaca.module';
import { SharedModule } from './shared/shared.module';
import { DevopsModule } from './devops/devops.module';
import { FinanceModule } from './finance/finance.module';

@Module({
  imports: [
    TelegramModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TranscaribeModule,
    PicoyplacaModule,
    SharedModule,
    DevopsModule,
    FinanceModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
