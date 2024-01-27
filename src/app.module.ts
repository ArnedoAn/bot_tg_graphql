import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { TranscaribeModule } from './transcaribe/transcaribe.module';
import { PicoyplacaModule } from './picoyplaca/picoyplaca.module';
import { SharedModule } from './shared/shared.module';
import { RemindersModule } from './reminders/reminders.module';
import { RemindersService } from './reminders/reminders.service';

@Module({
  imports: [
    TelegramModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TranscaribeModule,
    PicoyplacaModule,
    SharedModule,
    RemindersModule,
  ],
  controllers: [AppController],
  providers: [AppService, RemindersService],
})
export class AppModule {}
