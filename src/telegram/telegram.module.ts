import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PicoyplacaModule } from 'src/picoyplaca/picoyplaca.module';

@Module({
  providers: [TelegramService],
  imports: [PicoyplacaModule],
})
export class TelegramModule {}
