import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { GoogleWhitelist, User, UserIntegrationStatus } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(
    userId: string,
    opts?: { username?: string | null; firstName?: string | null },
  ): Promise<User> {
    return this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        username: opts?.username ?? undefined,
        firstName: opts?.firstName ?? undefined,
      },
      update: {
        ...(opts?.username !== undefined ? { username: opts.username } : {}),
        ...(opts?.firstName !== undefined ? { firstName: opts.firstName } : {}),
      },
    });
  }

  async getWhitelistByUserId(userId: string): Promise<GoogleWhitelist | null> {
    return this.prisma.googleWhitelist.findUnique({ where: { userId } });
  }

  async upsertWhitelistRequest(userId: string, email: string): Promise<GoogleWhitelist> {
    return this.prisma.googleWhitelist.upsert({
      where: { userId },
      create: { userId, email, approved: false },
      update: { email, approved: false },
    });
  }

  async setWhitelistApproved(userId: string, approved: boolean): Promise<GoogleWhitelist> {
    return this.prisma.googleWhitelist.update({
      where: { userId },
      data: { approved },
    });
  }

  async getPendingWhitelistEmails(): Promise<GoogleWhitelist[]> {
    return this.prisma.googleWhitelist.findMany({
      where: { approved: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async getIntegrationStatus(userId: string): Promise<UserIntegrationStatus | null> {
    return this.prisma.userIntegrationStatus.findUnique({ where: { userId } });
  }

  /** IDs de usuarios a monitorear: registrados en `users` o con progreso de finanzas */
  async getAllMonitoredUserIds(): Promise<string[]> {
    const [fromUsers, fromOnboarding] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true } }),
      this.prisma.financeOnboardingProgress.findMany({ select: { userId: true } }),
    ]);
    const set = new Set<string>();
    for (const u of fromUsers) set.add(u.id);
    for (const o of fromOnboarding) set.add(o.userId);
    return [...set];
  }

  startOfUtcDay(d: Date): Date {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }

  /**
   * Usuarios cuyo último chequeo no es hoy (UTC), para no re-consultar en el mismo día si el cron reintenta.
   */
  async getUserIdsNeedingCheckToday(allIds: string[]): Promise<string[]> {
    const start = this.startOfUtcDay(new Date());
    const statuses = await this.prisma.userIntegrationStatus.findMany({
      where: { userId: { in: allIds } },
    });
    const map = new Map(statuses.map((s) => [s.userId, s]));
    return allIds.filter((id) => {
      const s = map.get(id);
      if (!s?.lastCheckedAt) return true;
      return s.lastCheckedAt < start;
    });
  }

  async applyIntegrationCheckResult(
    userId: string,
    gmailOk: boolean,
    fireflyOk: boolean,
  ): Promise<UserIntegrationStatus> {
    const prev = await this.prisma.userIntegrationStatus.findUnique({
      where: { userId },
    });
    return this.prisma.userIntegrationStatus.upsert({
      where: { userId },
      create: {
        userId,
        gmailConnected: gmailOk,
        fireflyConnected: fireflyOk,
        gmailEverConnected: gmailOk,
        fireflyEverConnected: fireflyOk,
        lastCheckedAt: new Date(),
      },
      update: {
        gmailConnected: gmailOk,
        fireflyConnected: fireflyOk,
        gmailEverConnected: (prev?.gmailEverConnected ?? false) || gmailOk,
        fireflyEverConnected: (prev?.fireflyEverConnected ?? false) || fireflyOk,
        lastCheckedAt: new Date(),
      },
    });
  }

  async markNotified(userId: string): Promise<void> {
    await this.prisma.userIntegrationStatus.upsert({
      where: { userId },
      create: {
        userId,
        lastNotifiedAt: new Date(),
      },
      update: { lastNotifiedAt: new Date() },
    });
  }

  async markOnboardingReminderSent(userId: string): Promise<void> {
    await this.prisma.userIntegrationStatus.upsert({
      where: { userId },
      create: {
        userId,
        lastOnboardingReminderAt: new Date(),
      },
      update: { lastOnboardingReminderAt: new Date() },
    });
  }
}
