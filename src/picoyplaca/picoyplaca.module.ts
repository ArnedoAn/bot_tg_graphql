import { Module } from '@nestjs/common';
import { PicoyplacaService } from './picoyplaca.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  providers: [PicoyplacaService],
  imports: [HttpModule],
  exports: [PicoyplacaService],
})
export class PicoyplacaModule {}
