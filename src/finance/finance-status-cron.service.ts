import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotService } from '../shared/instances/bot.service';
import { UserService } from '../shared/prisma/user.service';
import { FinanceOnboardingService } from '../shared/prisma/finance-onboarding.service';
import { FinanceService } from './finance.service';
import { FeatureFlagsService } from '../shared/prisma/feature-flags.service';
import { FEATURE_FLAGS } from '../shared/constants/feature-flag-keys';

export interface FinanceCronRunSnapshot {
  ranAt: Date;
  usersChecked: number;
  usersWithProblems: number;
  gmailIssues: number;
  fireflyIssues: number;
  notificationsSent: number;
  onboardingRemindersSent: number;
  elapsedMs: number;
  errors: string[];
}

const STEP_LABELS: Record<string, string> = {
  firefly_signup: 'Cuenta en Firefly',
  firefly_token: 'Token de Firefly',
  gmail: 'Gmail',
  web_ui: 'Interfaz web',
  apk: 'APK',
};

@Injectable()
export class FinanceStatusCronService {
  private readonly logger = new Logger(FinanceStatusCronService.name);
  private lastSnapshot: FinanceCronRunSnapshot | null = null;

  constructor(
    private readonly financeService: FinanceService,
    private readonly botService: BotService,
    private readonly userService: UserService,
    private readonly onboarding: FinanceOnboardingService,
    private readonly configService: ConfigService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  getLastSnapshot(): FinanceCronRunSnapshot | null {
    return this.lastSnapshot;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private daysSince(d: Date | null | undefined): number {
    if (!d) return Infinity;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDailyStatusCheck(): Promise<void> {
    if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
      this.logger.log('[StatusCron] skipped: MODULE_FINANCE disabled');
      return;
    }

    const adminId = this.configService.get<string>('ADMIN_ID', '');
    const delayMs = parseInt(this.configService.get<string>('CRON_DELAY_MS', '500'), 10) || 500;
    const maxCycle = parseInt(this.configService.get<string>('CRON_MAX_USERS_PER_CYCLE', '0'), 10);
    const notifyCooldownDays =
      parseFloat(this.configService.get<string>('NOTIFY_COOLDOWN_DAYS', '3')) || 3;
    const onboardingStaleDays =
      parseFloat(this.configService.get<string>('ONBOARDING_STALE_DAYS', '3')) || 3;

    const t0 = Date.now();
    const errors: string[] = [];
    let usersChecked = 0;
    let usersWithProblems = 0;
    let gmailIssues = 0;
    let fireflyIssues = 0;
    let notificationsSent = 0;
    let onboardingRemindersSent = 0;

    const problemUsers: {
      userId: string;
      firstName: string | null;
      gmailOk: boolean;
      fireflyOk: boolean;
    }[] = [];

    try {
      const allIds = await this.userService.getAllMonitoredUserIds();
      let toProcess = await this.userService.getUserIdsNeedingCheckToday(allIds);
      if (maxCycle > 0 && toProcess.length > maxCycle) {
        toProcess = toProcess.slice(0, maxCycle);
      }

      for (const userId of toProcess) {
        const chatId = Number(userId);
        if (!Number.isFinite(chatId)) {
          errors.push(`userId inválido: ${userId}`);
          continue;
        }

        try {
          const [gmailR, fireflyR, prevStatus, userRow, prog] = await Promise.all([
            this.financeService.getGmailAuthStatus(userId),
            this.financeService.getFireflyStatus(userId),
            this.userService.getIntegrationStatus(userId),
            this.userService.getUserById(userId),
            this.onboarding.getOrCreate(userId),
          ]);

          const gmailOk =
            gmailR.success &&
            !!(gmailR.result as { gmail_authenticated?: boolean })?.gmail_authenticated;
          const fireflyOk =
            fireflyR.success && !!(fireflyR.result as { connected?: boolean })?.connected;

          await this.userService.applyIntegrationCheckResult(userId, gmailOk, fireflyOk);
          usersChecked++;

          const hasProblem = !gmailOk || !fireflyOk;
          if (hasProblem) {
            usersWithProblems++;
            if (!gmailOk) gmailIssues++;
            if (!fireflyOk) fireflyIssues++;
            problemUsers.push({
              userId,
              firstName: userRow?.firstName ?? null,
              gmailOk,
              fireflyOk,
            });

            const canNotify = this.daysSince(prevStatus?.lastNotifiedAt) >= notifyCooldownDays;
            if (canNotify) {
              const gmailEver = prevStatus?.gmailEverConnected ?? false;
              const fireflyEver = prevStatus?.fireflyEverConnected ?? false;
              const kb = this.buildProblemKeyboard(!gmailOk, !fireflyOk, gmailEver, fireflyEver);
              const text = this.buildProblemMessage(
                !gmailOk,
                !fireflyOk,
                gmailEver,
                fireflyEver,
              );
              await this.botService.sendMessageToUser(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: kb },
              });
              await this.userService.markNotified(userId);
              notificationsSent++;
            }
          }

          // Recordatorio de onboarding incompleto
          const step = prog.currentStep;
          if (
            step !== 'complete' &&
            step !== 'start' &&
            this.daysSince(prog.updatedAt) >= onboardingStaleDays
          ) {
            const integ = await this.userService.getIntegrationStatus(userId);
            const canRemind =
              this.daysSince(integ?.lastOnboardingReminderAt) >= notifyCooldownDays;
            if (canRemind) {
              const label = STEP_LABELS[step] ?? step;
              await this.botService.sendMessageToUser(
                chatId,
                `👋 Veo que dejaste la configuración en el paso *${label}*. ¿Quieres continuar?`,
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '▶️ Continuar configuración', callback_data: 'finance:wizard' }],
                    ],
                  },
                },
              );
              await this.userService.markOnboardingReminderSent(userId);
              onboardingRemindersSent++;
            }
          }

          await this.sleep(delayMs);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`user ${userId}: ${msg}`);
          this.logger.warn(`[StatusCron] user ${userId}: ${msg}`);
        }
      }

      const pending = await this.userService.getPendingWhitelistEmails();
      if (
        adminId.length > 0 &&
        (problemUsers.length > 0 || pending.length > 0)
      ) {
        const adminChat = Number(adminId);
        if (Number.isFinite(adminChat)) {
          let summary =
            '📊 *Resumen diario del monitor*\n\n' +
            `Usuarios comprobados: ${usersChecked}\n` +
            `Con problemas: ${problemUsers.length}\n` +
            `Notificaciones enviadas: ${notificationsSent}\n` +
            `Recordatorios onboarding: ${onboardingRemindersSent}\n\n`;

          if (problemUsers.length > 0) {
            summary += '*Usuarios con integraciones:*\n';
            for (const u of problemUsers) {
              const name = u.firstName || u.userId;
              summary += `• ${name}: Gmail ${u.gmailOk ? '✅' : '❌'} | Firefly ${u.fireflyOk ? '✅' : '❌'}\n`;
            }
          }

          if (pending.length > 0) {
            summary += '\n*Correos pendientes (Google Cloud Console):*\n';
            for (const p of pending) {
              summary += `• \`${p.email}\` (usuario \`${p.userId}\`)\n`;
            }
          }

          await this.botService.sendMessageToUser(adminChat, summary, {
            parse_mode: 'Markdown',
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`fatal: ${msg}`);
      this.logger.error(`[StatusCron] fatal: ${msg}`);
    }

    const elapsedMs = Date.now() - t0;
    this.lastSnapshot = {
      ranAt: new Date(),
      usersChecked,
      usersWithProblems,
      gmailIssues,
      fireflyIssues,
      notificationsSent,
      onboardingRemindersSent,
      elapsedMs,
      errors,
    };

    this.logger.log(
      `[StatusCron] checked=${usersChecked} problems=${usersWithProblems} gmailFail=${gmailIssues} fireflyFail=${fireflyIssues} notify=${notificationsSent} onboardRem=${onboardingRemindersSent} elapsed=${elapsedMs}ms`,
    );
  }

  private buildProblemKeyboard(
    gmailBad: boolean,
    fireflyBad: boolean,
    gmailEver: boolean,
    fireflyEver: boolean,
  ): { text: string; callback_data: string }[][] {
    const rows: { text: string; callback_data: string }[][] = [];
    if (gmailBad) {
      rows.push([
        {
          text: gmailEver ? '✉️ Reconectar Gmail' : '✉️ Configurar Gmail',
          callback_data: 'finance:wiz_jump:gmail',
        },
      ]);
    }
    if (fireflyBad) {
      rows.push([
        {
          text: fireflyEver ? '🔑 Actualizar token' : '🔑 Configurar Firefly',
          callback_data: 'finance:wiz_jump:firefly_token',
        },
      ]);
    }
    rows.push([{ text: '📋 Revisar configuración', callback_data: 'finance:review_setup' }]);
    return rows;
  }

  private buildProblemMessage(
    gmailBad: boolean,
    fireflyBad: boolean,
    gmailEver: boolean,
    fireflyEver: boolean,
  ): string {
    const lines = ['🔔 *Estado de Finanzas*\n'];
    if (gmailBad) {
      lines.push(
        gmailEver
          ? 'Tu conexión con *Gmail* se ha perdido. Puede pasar si cambiaste la contraseña o revocaste permisos. Reconecta en un minuto.'
          : 'Aún no has conectado *Google*. Sin eso no podemos leer correos de movimientos bancarios.',
      );
    }
    if (fireflyBad) {
      lines.push(
        fireflyEver
          ? 'Tu *token de Firefly* dejó de funcionar (puede haber expirado). Genera uno nuevo en tu perfil.'
          : 'Aún no hay un *token de Firefly* válido. Sin él no podemos registrar transacciones.',
      );
    }
    lines.push('\n_Toca un botón para ir al paso correspondiente._');
    return lines.join('\n');
  }
}
