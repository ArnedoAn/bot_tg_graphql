import { Module } from '@nestjs/common';
import { PicoyplacaService } from './picoyplaca.service';
import { PicoyplacaHandler } from './handlers/picoyplaca.handler';
import { HttpModule } from '@nestjs/axios';
import { SharedModule } from '../shared/shared.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  providers: [PicoyplacaService, PicoyplacaHandler],
  imports: [HttpModule, SharedModule, ScheduleModule.forRoot()],
  exports: [PicoyplacaHandler],
})
export class PicoyplacaModule {}
