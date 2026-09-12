import { Module } from '@nestjs/common';
import { PicoyplacaService } from './picoyplaca.service';
import { PicoyplacaHandler } from './handlers/picoyplaca.handler';
import { SharedModule } from '../shared/shared.module';

@Module({
  providers: [PicoyplacaService, PicoyplacaHandler],
  imports: [SharedModule],
  exports: [PicoyplacaHandler],
})
export class PicoyplacaModule {}
