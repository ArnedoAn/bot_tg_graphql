import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { BOT_ASSET_FINANCE_APK } from '../constants/feature-flag-keys';

@Injectable()
export class BotAssetService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinanceApk(): Promise<{ fileId: string; fileUniqueId: string | null } | null> {
    const row = await this.prisma.botAsset.findUnique({
      where: { id: BOT_ASSET_FINANCE_APK },
    });
    if (!row) return null;
    return { fileId: row.fileId, fileUniqueId: row.fileUniqueId };
  }

  async setFinanceApk(fileId: string, fileUniqueId?: string): Promise<void> {
    await this.prisma.botAsset.upsert({
      where: { id: BOT_ASSET_FINANCE_APK },
      create: {
        id: BOT_ASSET_FINANCE_APK,
        fileId,
        fileUniqueId: fileUniqueId ?? null,
      },
      update: { fileId, fileUniqueId: fileUniqueId ?? null },
    });
  }
}
