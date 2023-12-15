import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TarjetaService } from './tarjeta.service';
import { HistorialService } from './historial.service';

@Module({
  providers: [PrismaService, TarjetaService, HistorialService],
  exports: [TarjetaService, HistorialService],
})
export class PrismaModule {}
