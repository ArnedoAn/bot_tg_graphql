import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type MenuModePreference = 'simple' | 'advanced';

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * null = el usuario aún no eligió modo (mostrar selector).
   */
  async getMenuMode(userId: string): Promise<MenuModePreference | null> {
    const row = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!row) return null;
    return row.menuMode === 'advanced' ? 'advanced' : 'simple';
  }

  async setMenuMode(userId: string, mode: MenuModePreference): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, menuMode: mode },
      update: { menuMode: mode },
    });
  }
}
