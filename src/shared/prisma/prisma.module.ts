import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TarjetaService } from './tarjeta.service';
import { ReminderService } from './reminder.service';
import { VehicleService } from './vehicle.service';

@Module({
  providers: [PrismaService, TarjetaService, ReminderService, VehicleService],
  exports: [TarjetaService, ReminderService, VehicleService],
})
export class PrismaModule {}
