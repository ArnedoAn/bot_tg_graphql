import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from '../shared/instances/bot.service';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { FeatureFlagsService } from '../shared/prisma/feature-flags.service';
import { BotAssetService } from '../shared/prisma/bot-asset.service';
import { UserService } from '../shared/prisma/user.service';
import { FinanceStatusCronService } from '../finance/finance-status-cron.service';
import {
  ALL_FEATURE_FLAG_KEYS,
  FeatureFlagKey,
  FEATURE_FLAGS,
} from '../shared/constants/feature-flag-keys';

const FLAG_LABELS: Record<FeatureFlagKey, string> = {
  [FEATURE_FLAGS.MODULE_FINANCE]: 'Módulo Finanzas',
  [FEATURE_FLAGS.MODULE_TRANSCARIBE]: 'Módulo Transcaribe',
  [FEATURE_FLAGS.MODULE_PICOYPLACA]: 'Módulo Pico y Placa',
  [FEATURE_FLAGS.MODULE_DEVOPS]: 'Módulo DevOps',
  [FEATURE_FLAGS.FINANCE_LAUNCH_SOLO]: '🚀 Modo lanzamiento (solo Finanzas)',
  [FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL]: 'Finanzas: tutorial',
  [FEATURE_FLAGS.FINANCE_SECTION_REVIEW]: 'Finanzas: revisar config',
  [FEATURE_FLAGS.FINANCE_SECTION_BATCH]: 'Finanzas: procesar correos',
  [FEATURE_FLAGS.FINANCE_SECTION_DRYRUN]: 'Finanzas: modo prueba',
  [FEATURE_FLAGS.FINANCE_SECTION_HEALTH]: 'Finanzas: estado servicio',
  [FEATURE_FLAGS.FINANCE_SECTION_GMAIL]: 'Finanzas: Gmail',
  [FEATURE_FLAGS.FINANCE_SECTION_FIREFLY_TOKEN]: 'Finanzas: token Firefly',
  [FEATURE_FLAGS.FINANCE_SECTION_SYNC]: 'Finanzas: sincronizar',
  [FEATURE_FLAGS.FINANCE_SECTION_SENDERS]: 'Finanzas: senders',
  [FEATURE_FLAGS.FINANCE_SECTION_AUDIT]: 'Finanzas: auditoría',
  [FEATURE_FLAGS.FINANCE_SECTION_SCHEDULER]: 'Finanzas: scheduler',
  [FEATURE_FLAGS.FINANCE_SECTION_USER_ID]: 'Finanzas: user ID',
  [FEATURE_FLAGS.FINANCE_SECTION_APK]: 'Finanzas: APK',
  [FEATURE_FLAGS.FINANCE_SECTION_STATS]: 'Finanzas: estadísticas',
  [FEATURE_FLAGS.FINANCE_SECTION_RETRY]: 'Finanzas: reintentar',
  [FEATURE_FLAGS.FINANCE_SECTION_LEARN]: 'Finanzas: aprender senders',
};

@Injectable()
export class AdminHandler {
  private readonly logger = new Logger(AdminHandler.name);
  private readonly bot: TelegramBot;
  private readonly adminId: string;
  private readonly unauthorizedMessage = '🔒 Solo el administrador puede usar el panel.';

  constructor(
    private readonly botInstance: BotService,
    private readonly configService: ConfigService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly botAssets: BotAssetService,
    private readonly userService: UserService,
    private readonly financeCronStatus: FinanceStatusCronService,
  ) {
    this.bot = this.botInstance.getBot();
    this.adminId = this.configService.get<string>('ADMIN_ID', '');
  }

  isAdmin(chatId: number): boolean {
    return String(chatId) === this.adminId && this.adminId.length > 0;
  }

  private async deny(chatId: number): Promise<void> {
    await this.botInstance.sendMessageToUser(chatId, this.unauthorizedMessage);
  }

  private buildPanelKeyboard(states: Record<string, boolean>): InlineKeyboardButton[][] {
    const rows: InlineKeyboardButton[][] = [];
    ALL_FEATURE_FLAG_KEYS.forEach((key, idx) => {
      const on = states[key] !== false;
      const label = FLAG_LABELS[key] ?? key;
      rows.push([
        {
          text: `${on ? '✅' : '❌'} ${label}`,
          callback_data: `admin:t:${idx}`,
        },
      ]);
    });
    rows.push([
      { text: '📊 Monitor de usuarios', callback_data: 'admin:cron_status' },
    ]);
    rows.push([
      { text: '📧 Correos Gmail pendientes', callback_data: 'admin:pending_gmail' },
    ]);
    rows.push([
      { text: '⬅️ Volver al menú', callback_data: 'menu:main' },
    ]);
    return rows;
  }

  private panelIntroText(apkRegistered: boolean): string {
    return (
      '🔐 *Panel de administración*\n\n' +
      'Toca un ítem para alternar visibilidad (usuarios no admin).\n' +
      '*Modo lanzamiento*: oculta Transcaribe y Pico y Placa en el menú principal.\n' +
      'DevOps sigue siendo solo para administrador.\n\n' +
      `*APK Finanzas:* ${apkRegistered ? 'registrada (envía un nuevo .apk para reemplazar)' : '_sin archivo — envía un documento .apk en este chat_'}\n\n` +
      '_Los cambios se aplican al instante._'
    );
  }

  async showPanel(chatId: number, messageId?: number): Promise<void> {
    if (!this.isAdmin(chatId)) return this.deny(chatId);

    const states = await this.featureFlags.getAll();
    const apk = await this.botAssets.getFinanceApk();
    const text = this.panelIntroText(!!apk);
    const keyboard = this.buildPanelKeyboard(states);

    const opts = {
      parse_mode: 'Markdown' as const,
      reply_markup: { inline_keyboard: keyboard },
    };

    if (messageId) {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...opts,
      });
    } else {
      await this.botInstance.sendMessageToUser(chatId, text, opts);
    }
  }

  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    if (!this.isAdmin(chatId)) {
      await this.deny(chatId);
      return;
    }

    if (action === 'cron_status') {
      const snap = this.financeCronStatus.getLastSnapshot();
      const agoMs = snap ? Date.now() - snap.ranAt.getTime() : 0;
      const agoMin = Math.floor(agoMs / 60000);
      const agoHuman =
        !snap || agoMin < 1
          ? 'hace un momento'
          : agoMin < 60
            ? `hace ${agoMin} min`
            : agoMin < 1440
              ? `hace ${Math.floor(agoMin / 60)} h`
              : `hace ${Math.floor(agoMin / 1440)} d`;
      const text = snap
        ? '📊 *Monitor de usuarios (último cron)*\n\n' +
          `• Último chequeo: _${agoHuman}_ (${snap.ranAt.toISOString()})\n` +
          `• Usuarios comprobados: ${snap.usersChecked}\n` +
          `• Con problemas: ${snap.usersWithProblems}\n` +
          `• Fallos Gmail: ${snap.gmailIssues}\n` +
          `• Fallos Firefly: ${snap.fireflyIssues}\n` +
          `• Notificaciones enviadas: ${snap.notificationsSent}\n` +
          `• Recordatorios onboarding: ${snap.onboardingRemindersSent}\n` +
          `• Duración: ${snap.elapsedMs} ms\n` +
          (snap.errors.length
            ? `\n*Errores:*\n${snap.errors.slice(0, 8).map((e) => `• ${e}`).join('\n')}`
            : '')
        : '📊 *Monitor de usuarios*\n\n_Aún no hay ejecuciones registradas (el cron corre a las 08:00)._';

      if (messageId) {
        await this.bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Volver al panel', callback_data: 'admin:panel' }]],
          },
        });
      } else {
        await this.botInstance.sendMessageToUser(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Volver al panel', callback_data: 'admin:panel' }]],
          },
        });
      }
      return;
    }

    if (action === 'pending_gmail') {
      const pending = await this.userService.getPendingWhitelistEmails();
      let body =
        '📧 *Correos Gmail pendientes de aprobación*\n\n' +
        '_Agrega cada correo en Google Cloud Console (usuarios de prueba) y pulsa Aprobar._\n\n';
      if (pending.length === 0) {
        body += '_No hay solicitudes pendientes._';
      }
      const keyboard: InlineKeyboardButton[][] = [];
      for (const p of pending.slice(0, 20)) {
        const row: InlineKeyboardButton[] = [
          {
            text: `✅ ${p.email.slice(0, 28)}`,
            callback_data: `admin:approve_gmail:${p.userId}`,
          },
        ];
        keyboard.push(row);
      }
      keyboard.push([{ text: '⬅️ Volver al panel', callback_data: 'admin:panel' }]);

      if (messageId) {
        await this.bot.editMessageText(body, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        await this.botInstance.sendMessageToUser(chatId, body, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      }
      return;
    }

    if (action.startsWith('approve_gmail:')) {
      const targetUserId = action.slice('approve_gmail:'.length).trim();
      try {
        await this.userService.setWhitelistApproved(targetUserId, true);
        const targetChat = Number(targetUserId);
        if (Number.isFinite(targetChat)) {
          await this.botInstance.sendMessageToUser(
            targetChat,
            '✅ *Tu correo fue aprobado.*\n\nYa puedes continuar con la configuración de *Gmail* en el tutorial.',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '▶️ Continuar tutorial', callback_data: 'finance:wizard' }],
                ],
              },
            },
          );
        }
        await this.botInstance.sendMessageToUser(
          chatId,
          `✅ Aprobado el correo del usuario \`${targetUserId}\`.`,
          { parse_mode: 'Markdown' },
        );
      } catch (e) {
        this.logger.warn(`approve_gmail failed: ${e}`);
        await this.botInstance.sendMessageToUser(
          chatId,
          '❌ No se pudo aprobar (¿solicitud inexistente?).',
        );
      }
      await this.showPanel(chatId, messageId);
      return;
    }

    if (action.startsWith('t:')) {
      const idx = parseInt(action.slice(2), 10);
      if (idx >= 0 && idx < ALL_FEATURE_FLAG_KEYS.length) {
        const key = ALL_FEATURE_FLAG_KEYS[idx];
        await this.featureFlags.toggle(key);
      }
      await this.showPanel(chatId, messageId);
      return;
    }

    if (action === 'main' || action === 'panel') {
      await this.showPanel(chatId, messageId);
    }
  }
}
