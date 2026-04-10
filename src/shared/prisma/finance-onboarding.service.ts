import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export const FINANCE_WIZARD_STEPS = [
  'start',
  'firefly_signup',
  'firefly_token',
  'gmail',
  'web_ui',
  'apk',
  'complete',
] as const;

export type FinanceWizardStep = (typeof FINANCE_WIZARD_STEPS)[number];

@Injectable()
export class FinanceOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    return this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async setCurrentStep(userId: string, step: FinanceWizardStep): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId, currentStep: step },
      update: { currentStep: step },
    });
  }

  /** Solo marca el flag (no cambia el paso del tutorial). Útil si el token se guarda fuera del asistente. */
  async touchFireflyTokenOk(userId: string): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId, fireflyTokenDone: true },
      update: { fireflyTokenDone: true },
    });
  }

  async markFireflyTokenDone(userId: string): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId, fireflyTokenDone: true, currentStep: 'gmail' },
      update: { fireflyTokenDone: true, currentStep: 'gmail' },
    });
  }

  async markGmailDone(userId: string): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId, gmailDone: true, currentStep: 'web_ui' },
      update: { gmailDone: true, currentStep: 'web_ui' },
    });
  }

  async markWebUiDone(userId: string): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId, webUiDone: true, currentStep: 'apk' },
      update: { webUiDone: true, currentStep: 'apk' },
    });
  }

  async markApkManualDone(userId: string): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: { userId, apkManualDone: true, currentStep: 'complete' },
      update: { apkManualDone: true, currentStep: 'complete' },
    });
  }

  async markComplete(userId: string): Promise<void> {
    await this.prisma.financeOnboardingProgress.upsert({
      where: { userId },
      create: {
        userId,
        currentStep: 'complete',
        completedAt: new Date(),
      },
      update: {
        currentStep: 'complete',
        completedAt: new Date(),
      },
    });
  }

  async skipApkToComplete(userId: string): Promise<void> {
    await this.markComplete(userId);
  }

  stepIndex(step: string): number {
    const i = FINANCE_WIZARD_STEPS.indexOf(step as FinanceWizardStep);
    return i < 0 ? 0 : i;
  }

  stepAt(index: number): FinanceWizardStep {
    const clamped = Math.max(0, Math.min(FINANCE_WIZARD_STEPS.length - 1, index));
    return FINANCE_WIZARD_STEPS[clamped];
  }
}
