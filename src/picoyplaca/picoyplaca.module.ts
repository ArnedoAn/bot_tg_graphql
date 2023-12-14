import { Module } from '@nestjs/common';
import { PicoyplacaService } from './picoyplaca.service';
import { PicoyplacaHandler } from './handlers/picoyplaca.handler';
import { HttpModule } from '@nestjs/axios';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  providers: [PicoyplacaService, PicoyplacaHandler],
  imports: [HttpModule, SharedModule],
  exports: [PicoyplacaHandler],
})
export class PicoyplacaModule {}
