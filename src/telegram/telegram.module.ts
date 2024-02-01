import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PicoyplacaModule } from '../picoyplaca/picoyplaca.module';
import { SharedModule } from '../shared/shared.module';
import { TranscaribeModule } from '../transcaribe/transcaribe.module';

@Module({
  providers: [TelegramService],
  imports: [PicoyplacaModule, SharedModule, TranscaribeModule],
})
export class TelegramModule {}
