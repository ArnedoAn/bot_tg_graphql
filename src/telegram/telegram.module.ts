import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PicoyplacaModule } from 'src/picoyplaca/picoyplaca.module';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  providers: [TelegramService],
  imports: [PicoyplacaModule, SharedModule],
})
export class TelegramModule {}
