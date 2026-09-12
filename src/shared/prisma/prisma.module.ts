import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TarjetaService } from './tarjeta.service';
import { VehicleService } from './vehicle.service';
import { UserSettingsService } from './user-settings.service';
import { FeatureFlagsService } from './feature-flags.service';
import { FinanceOnboardingService } from './finance-onboarding.service';
import { BotAssetService } from './bot-asset.service';
import { UserService } from './user.service';

@Module({
  providers: [
    PrismaService,
    TarjetaService,
    VehicleService,
    UserSettingsService,
    FeatureFlagsService,
    FinanceOnboardingService,
    BotAssetService,
    UserService,
  ],
  exports: [
    TarjetaService,
    VehicleService,
    UserSettingsService,
    FeatureFlagsService,
    FinanceOnboardingService,
    BotAssetService,
    UserService,
  ],
})
export class PrismaModule {}
