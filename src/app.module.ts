import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { TranscaribeModule } from './transcaribe/transcaribe.module';
import { PicoyplacaModule } from './picoyplaca/picoyplaca.module';

@Module({
  imports: [
    TelegramModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TranscaribeModule,
    PicoyplacaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
