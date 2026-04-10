import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ALL_FEATURE_FLAG_KEYS, FeatureFlagKey } from '../constants/feature-flag-keys';

@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
  }

  /** Crea filas faltantes con enabled=true (no sobrescribe valores existentes). */
  async ensureDefaults(): Promise<void> {
    for (const key of ALL_FEATURE_FLAG_KEYS) {
      await this.prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabled: true },
        update: {},
      });
    }
    this.logger.log('Feature flags por defecto verificados');
  }

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    return row?.enabled ?? true;
  }

  async setEnabled(key: FeatureFlagKey, enabled: boolean): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
  }

  async toggle(key: FeatureFlagKey): Promise<boolean> {
    const current = await this.isEnabled(key);
    const next = !current;
    await this.setEnabled(key, next);
    return next;
  }

  async getAll(): Promise<Record<string, boolean>> {
    const rows = await this.prisma.featureFlag.findMany();
    const map: Record<string, boolean> = {};
    for (const k of ALL_FEATURE_FLAG_KEYS) {
      map[k] = true;
    }
    for (const r of rows) {
      map[r.key] = r.enabled;
    }
    return map;
  }
}
