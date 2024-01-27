import { Module } from '@nestjs/common';
import { PicoyplacaService } from './picoyplaca.service';
import { PicoyplacaHandler } from './handlers/picoyplaca.handler';
import { HttpModule } from '@nestjs/axios';
import { SharedModule } from 'src/shared/shared.module';
import { PrismaModule } from 'src/shared/prisma/prisma.module';

@Module({
  providers: [PicoyplacaService, PicoyplacaHandler],
  imports: [HttpModule, SharedModule, PrismaModule],
  exports: [PicoyplacaHandler],
})
export class PicoyplacaModule {}
