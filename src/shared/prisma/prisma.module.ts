import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TarjetaService } from './tarjeta.service';
import { ReminderService } from './reminder.service';
import { VehicleService } from './vehicle.service';
import { UserSettingsService } from './user-settings.service';

@Module({
  providers: [PrismaService, TarjetaService, ReminderService, VehicleService, UserSettingsService],
  exports: [TarjetaService, ReminderService, VehicleService, UserSettingsService],
})
export class PrismaModule {}
