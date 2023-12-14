import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TarjetaService } from './tarjeta.service';

@Module({
  providers: [PrismaService, TarjetaService],
  exports: [TarjetaService],
})
export class PrismaModule {}
