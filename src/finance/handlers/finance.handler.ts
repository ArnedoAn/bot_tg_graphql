import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import { UserMenuModeService } from '../../shared/instances/user-menu-mode.service';
import { UserService } from '../../shared/prisma/user.service';
import {
  FinanceService,
  BatchProcessingResponse,
  BatchProcessingJobEnqueueResponse,
  ProcessingJobStatusResponse,
} from '../finance.service';
import { FeatureFlagsService } from '../../shared/prisma/feature-flags.service';
import {
  FinanceOnboardingService,
  FinanceWizardStep,
  FINANCE_WIZARD_STEPS,
} from '../../shared/prisma/finance-onboarding.service';
import {
  onboardingUrls,
  financeTitle as financeTitleHelper,
  getUserId as getUserIdHelper,
  sleep as sleepHelper,
  sectionOn as sectionOnHelper,
  isGoogleTestingMode as isGoogleTestingModeHelper,
  buildProgressBar as buildProgressBarHelper,
  wizardNavKeyboard as wizardNavKeyboardHelper,
  isValidEmail as isValidEmailHelper,
  editOrSend as editOrSendHelper,
  buildSimpleMenuOptions as buildSimpleMenuOptionsHelper,
  buildAdvancedMenuOptions as buildAdvancedMenuOptionsHelper,
  buildSimpleOperationsMenu as buildSimpleOperationsMenuHelper,
} from './finance.helpers';
import { BotAssetService } from '../../shared/prisma/bot-asset.service';
import { FinanceWizardHandler } from './finance.wizard.handler';
import { FinanceBatchHandler } from './finance.batch.handler';
import { FEATURE_FLAGS } from '../../shared/constants/feature-flag-keys';

@Injectable()
export class FinanceHandler {
  private readonly logger = new Logger(FinanceHandler.name);
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  constructor(
    private readonly financeService: FinanceService,
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly onboarding: FinanceOnboardingService,
    private readonly botAssets: BotAssetService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly wizardHandler: FinanceWizardHandler,
    private readonly batchHandler: FinanceBatchHandler,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private async isAdvanced(chatId: number): Promise<boolean> {
    return this.userMenuMode.isAdvancedUser(chatId);
  }

  /** Título de sección según perfil */
  private financeTitle(advanced: boolean): string {
    return financeTitleHelper(advanced);
  }

  private getUserId(chatId: number): string {
    return getUserIdHelper(chatId);
  }

  private async sleep(ms: number): Promise<void> {
    await sleepHelper(ms);
  }

  private async sectionOn(key: (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS]): Promise<boolean> {
    return sectionOnHelper(this.featureFlags, key);
  }

  private isGoogleTestingMode(): boolean {
    return isGoogleTestingModeHelper(this.configService);
  }

  private buildProgressBar(
    step: FinanceWizardStep,
    prog: {
      fireflyTokenDone: boolean;
      gmailDone: boolean;
      webUiDone: boolean;
      apkManualDone: boolean;
    },
  ): string {
    return buildProgressBarHelper(step, prog);
  }

  /**
   * Menú usuario común: tutorial primero, operaciones aparte.
   */
  private async buildSimpleMenuOptions(): Promise<InlineKeyboardButton[][]> {
    return buildSimpleMenuOptionsHelper(this.featureFlags);
  }

  /**
   * Menú avanzado: tutorial + operaciones técnicas filtradas por flags.
   */
  private async buildAdvancedMenuOptions(): Promise<InlineKeyboardButton[][]> {
    return buildAdvancedMenuOptionsHelper(this.featureFlags);
  }

  /** Submenú de operaciones para menú simple (mismas acciones que antes, filtradas). */
  private async buildSimpleOperationsMenu(): Promise<InlineKeyboardButton[][]> {
    return buildSimpleOperationsMenuHelper(this.featureFlags);
  }

  async getMenuOptions(
    chatId: number,
    advanced?: boolean,
  ): Promise<InlineKeyboardButton[][]> {
    const adv = advanced ?? (await this.isAdvanced(chatId));
    return adv ? this.buildAdvancedMenuOptions() : this.buildSimpleMenuOptions();
  }

  /**
   * Show finance menu
   */
  async showMenu(chatId: number, messageId?: number): Promise<void> {
    if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
      const t = 'El módulo de finanzas no está disponible en este momento.';
      if (messageId) {
        await this.bot.editMessageText(t, { chat_id: chatId, message_id: messageId });
      } else {
        await this.bot.sendMessage(chatId, t);
      }
      return;
    }

    const adv = await this.isAdvanced(chatId);
    const intro = adv
      ? 'Selecciona una opción (tutorial, revisión o herramientas técnicas):'
      : '🎓 *Primera vez?* Abre *Configurar finanzas (tutorial)*.\n\n' +
        'Para procesar correos y acciones del día a día, entra en *Operaciones*.';
    const text = `${this.financeTitle(adv)}\n\n${intro}`;

    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: await this.getMenuOptions(chatId, adv),
      },
    };

    if (messageId) {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options,
      });
    } else {
      await this.bot.sendMessage(chatId, text, options);
    }
  }

  /** Entrada pública: comando /configurar_finanzas */
  async openFinanceWizard(chatId: number, messageId?: number): Promise<void> {
    return this.wizardHandler.openFinanceWizard(chatId, messageId);
  }

  private wizardNavKeyboard(
    step: FinanceWizardStep,
    opts?: { showNext?: boolean; showBack?: boolean },
  ): InlineKeyboardButton[][] {
    return wizardNavKeyboardHelper(step, opts);
  }

  private async showSimpleOperationsMenu(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    await this.wizardHandler.showSimpleOperationsMenu(chatId, messageId);
  }

  async showConfigReview(chatId: number, messageId?: number): Promise<void> {
    return this.wizardHandler.showConfigReview(chatId, messageId);
  }

  private async handleWizardAction(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    await this.wizardHandler.handleWizardAction(chatId, action, messageId);
  }

  private isValidEmail(raw: string): boolean {
    return isValidEmailHelper(raw);
  }

  /**
   * Envía la APK registrada por el admin, o avisa si no hay archivo.
   */
  private async deliverFinanceApk(
    chatId: number,
    opts?: { messageId?: number; missingApkKeyboard?: InlineKeyboardButton[][] },
  ): Promise<void> {
    await this.wizardHandler.deliverFinanceApk(chatId, opts);
  }

  /**
   * Handle callback queries
   */
  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<boolean> {
    // Calendar navigation
    if (action.startsWith('cal_')) {
      await this.handleCalendarNavigation(chatId, action, messageId);
      return true;
    }

    // Date selection
    if (action.startsWith('date_')) {
      await this.handleDateSelection(chatId, action, messageId);
      return true;
    }

    if (
      action === 'wizard' ||
      action === 'review_setup' ||
      action === 'ops_menu' ||
      action.startsWith('wiz_')
    ) {
      if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
        return true;
      }
      if (action === 'review_setup') {
        if (!(await this.sectionOn(FEATURE_FLAGS.FINANCE_SECTION_REVIEW))) {
          await this.editOrSend(
            chatId,
            messageId,
            'Esta sección no está disponible.',
            [[{ text: '🔙 Volver', callback_data: 'menu:finance' }]],
          );
          return true;
        }
        await this.showConfigReview(chatId, messageId);
        return true;
      }
      if (action === 'ops_menu') {
        await this.showSimpleOperationsMenu(chatId, messageId);
        return true;
      }
      if (action === 'wizard') {
        await this.openFinanceWizard(chatId, messageId);
        return true;
      }
      await this.handleWizardAction(chatId, action, messageId);
      return true;
    }

    const advancedOnly = new Set([
      'dryrun',
      'stats',
      'audit',
      'scheduler',
      'retry',
      'senders',
      'learn',
    ]);
    const adv = await this.isAdvanced(chatId);
    if (!adv && advancedOnly.has(action)) {
      const text =
        `${this.financeTitle(adv)}\n\n` +
        'Esta opción solo está en *menú avanzado*. Pulsa *Cambiar modo de menú* en el inicio y elige *Menú avanzado*.';
      await this.editOrSend(chatId, messageId, text, [
        [{ text: '🔙 Volver', callback_data: 'menu:finance' }],
      ]);
      return true;
    }

    switch (action) {
      case 'menu':
        await this.showMenu(chatId, messageId);
        return true;
      case 'get_apk':
        await this.deliverFinanceApk(chatId, { messageId });
        return true;
      case 'batch':
        await this.initDateSelector(chatId, messageId, false);
        return true;
      case 'dryrun':
        await this.initDateSelector(chatId, messageId, true);
        return true;
      case 'stats':
        await this.showStatistics(chatId, messageId);
        return true;
      case 'audit':
        await this.showAuditLogs(chatId, messageId);
        return true;
      case 'gmail_status':
        await this.showGmailStatus(chatId, messageId);
        return true;
      case 'gmail_reconnect':
        await this.showGmailReconnect(chatId, messageId);
        return true;
      case 'health':
        await this.showHealthCheck(chatId, messageId);
        return true;
      case 'firefly_token':
        await this.setFireflyTokenAction(chatId, messageId);
        return true;
      case 'show_user_id':
        await this.showApiUserId(chatId, messageId);
        return true;
      case 'scheduler':
        await this.showSchedulerStatus(chatId, messageId);
        return true;
      case 'retry':
        await this.retryFailedAction(chatId, messageId);
        return true;
      case 'senders':
        await this.showKnownSenders(chatId, messageId);
        return true;
      case 'learn':
        await this.learnSendersAction(chatId, messageId);
        return true;
      case 'sync':
        await this.syncFireflyAction(chatId, messageId);
        return true;
      case 'batch_process':
        await this.initDateSelector(chatId, messageId, false);
        return true;
      case 'noop':
        return true;
      default:
        return false;
    }
  }

  /**
   * Initialize date selector calendar
   */
  private async initDateSelector(
    chatId: number,
    messageId: number | undefined,
    dryRun: boolean,
  ): Promise<void> {
    return this.batchHandler.initDateSelector(chatId, messageId, dryRun);
  }

  private async handleCalendarNavigation(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    await this.batchHandler.handleCalendarNavigation(chatId, action, messageId);
  }

  private async handleDateSelection(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    await this.batchHandler.handleDateSelection(chatId, action, messageId);
  }

  /**
   * Show user id sent to Finance API (header X-User-Id)
   */
  private async showApiUserId(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const userId = this.getUserId(chatId);
    const text = adv
      ? `${this.financeTitle(adv)}\n\n` +
        `🆔 *User ID para la API*\n\n` +
        `Este valor se envía en el header *X-User-Id* en todas las peticiones al Finance API:\n\n` +
        `\`${userId}\`\n\n` +
        `_Equivale a tu Telegram chat id (string)._`
      : `${this.financeTitle(adv)}\n\n` +
        `🆔 *Tu código de usuario*\n\n` +
        `Si el soporte te lo pide, envía este número:\n\n` +
        `\`${userId}\`\n\n` +
        `_Es tu identificador en Telegram (solo para este bot)._`;

    const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show Gmail authentication status
   */
  private async showGmailStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Comprobando Gmail...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getGmailAuthStatus(this.getUserId(chatId));

    let text: string;
    if (result.success) {
      const data = result.result;
      if (adv) {
        const status = data.gmail_authenticated ? '✅ Autenticado' : '❌ No autenticado';
        text =
          `${this.financeTitle(adv)}\n\n` +
          `🔐 *Estado de Gmail*\n\n` +
          `• Estado: ${status}\n` +
          `• Email: ${data.email || 'N/A'}\n` +
          `• Mensaje: ${data.message}`;
      } else {
        const ok = data.gmail_authenticated;
        text =
          `${this.financeTitle(adv)}\n\n` +
          `✉️ *Gmail*\n\n` +
          (ok
            ? `✅ *Conectado*\nCuenta: ${data.email || '—'}\n\n${data.message || ''}`
            : `❌ *Aún no conectado*\nUsa *Conectar o renovar Gmail* para iniciar sesión.\n\n${data.message || ''}`);
      }
    } else {
      text = adv
        ? `${this.financeTitle(adv)}\n\n❌ Error: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo comprobar Gmail. Intenta más tarde.\n\n_Detalle: ${result.result}_`;
    }

    const keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show Gmail reconnect with auth URL
   */
  private async showGmailReconnect(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Preparando enlace seguro...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getGmailAuthUrl(this.getUserId(chatId));

    let text: string;
    let keyboard: InlineKeyboardButton[][];

    if (result.success) {
      const data = result.result;
      text = adv
        ? `${this.financeTitle(adv)}\n\n` +
          `🔗 *Reconectar Gmail*\n\n` +
          `Para volver a autenticar Gmail, haz clic en el botón de abajo:\n\n` +
          `⚠️ _Este enlace expira en pocos minutos_`
        : `${this.financeTitle(adv)}\n\n` +
          `🔗 *Conectar Gmail*\n\n` +
          `Pulsa el botón, inicia sesión con Google y vuelve aquí.\n\n` +
          `⚠️ _El enlace caduca en pocos minutos._`;

      keyboard = [
        [
          {
            text: adv ? '🔐 Autenticar Gmail' : '🔐 Abrir Google',
            url: data.authorization_url,
          },
        ],
        [{ text: '🔄 Comprobar de nuevo', callback_data: 'finance:gmail_status' }],
        [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
      ];
    } else {
      text = adv
        ? `${this.financeTitle(adv)}\n\n❌ Error: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo abrir el enlace. Intenta de nuevo.\n\n_Detalle: ${result.result}_`;
      keyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }]];
    }

    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show full health check
   */
  private async showHealthCheck(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Revisando que todo funcione...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const [healthResult, fireflyResult, deepseekResult] = await Promise.all([
      this.financeService.getHealthCheck(this.getUserId(chatId)),
      this.financeService.getFireflyStatus(this.getUserId(chatId)),
      this.financeService.getDeepSeekStatus(this.getUserId(chatId)),
    ]);

    let text: string;

    if (adv) {
      text = `${this.financeTitle(adv)}\n\n🏥 *Health Check*\n\n`;

      if (healthResult.success) {
        const h = healthResult.result;
        text += `*General:*\n`;
        text += `• Estado: ${h.status === 'healthy' ? '✅' : '❌'} ${h.status}\n`;
        text += `• Versión: ${h.version}\n`;
        text += `• Ambiente: ${h.environment}\n\n`;

        if (h.services) {
          text += `*Servicios:*\n`;
          for (const [service, status] of Object.entries(h.services)) {
            text += `• ${service}: ${status ? '✅' : '❌'}\n`;
          }
        }
      } else {
        text += `❌ API no disponible\n`;
      }

      text += `\n*Firefly III:* `;
      text += fireflyResult.success
        ? `✅ ${fireflyResult.result?.connected ? 'Conectado' : 'Disponible'}`
        : `❌ Error`;

      text += `\n*DeepSeek AI:* `;
      text += deepseekResult.success
        ? `✅ ${deepseekResult.result?.connected ? 'Conectado' : 'Disponible'}`
        : `❌ Error`;
    } else {
      const apiOk = healthResult.success && healthResult.result?.status === 'healthy';
      const fireflyOk = fireflyResult.success && fireflyResult.result?.connected;
      text =
        `${this.financeTitle(adv)}\n\n` +
        `✅ *Estado del servicio*\n\n` +
        `• Servicio principal: ${apiOk ? '✅ Todo bien' : '⚠️ Hay un problema'}\n` +
        `• Conexión con Firefly: ${fireflyOk ? '✅ Lista' : '⚠️ Revisa o sincroniza'}\n\n` +
        `_Si algo falla, revisa Gmail y el token de Firefly._`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:health' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show processing statistics
   */
  private async showStatistics(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo estadísticas...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getStatistics(this.getUserId(chatId));

    let text = `💰 *Finance Analyzer*\n\n📊 *Estadísticas*\n\n`;

    if (result.success) {
      const stats = result.result;
      for (const [key, value] of Object.entries(stats)) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        text += `• ${label}: ${value}\n`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:stats' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show audit logs
   */
  private async showAuditLogs(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo logs de auditoría...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getAuditLogs(this.getUserId(chatId), 10);

    let text = `💰 *Finance Analyzer*\n\n📜 *Últimos 10 logs*\n\n`;

    if (result.success) {
      const logs = result.result.logs || result.result;
      if (Array.isArray(logs) && logs.length > 0) {
        for (const log of logs.slice(0, 10)) {
          const status = log.status === 'created' ? '✅' : log.status === 'failed' ? '❌' : '⏭️';
          const date = log.created_at ? new Date(log.created_at).toLocaleString('es-CO') : 'N/A';
          text += `${status} \`${(log.email_id || 'unknown').substring(0, 12)}...\`\n`;
          text += `   ${date}\n`;
        }
      } else {
        text += `No hay logs disponibles.`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:audit' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show scheduler status
   */
  private async showSchedulerStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo estado del scheduler...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getSchedulerStatus(this.getUserId(chatId));

    let text = `💰 *Finance Analyzer*\n\n⏰ *Estado del Scheduler*\n\n`;

    if (result.success) {
      const data = result.result;
      text += `• Running: ${data.running ? '✅ Sí' : '❌ No'}\n`;
      if (data.jobs && Array.isArray(data.jobs)) {
        text += `\n*Jobs:*\n`;
        for (const job of data.jobs) {
          text += `• ${job.id || job.name}: ${job.next_run || 'N/A'}\n`;
        }
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Actualizar', callback_data: 'finance:scheduler' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Retry failed emails
   */
  private async retryFailedAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Reintentando emails fallidos...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.retryFailed(this.getUserId(chatId), 50);

    let text = `💰 *Finance Analyzer*\n\n🔄 *Reintentar Fallidos*\n\n`;

    if (result.success) {
      const data = result.result as BatchProcessingResponse;
      text +=
        `✅ *Procesamiento completado*\n\n` +
        `• Total: ${data.total_emails}\n` +
        `• Creados: ${data.created}\n` +
        `• Fallidos: ${data.failed}\n` +
        `• Tiempo: ${data.processing_time_ms}ms`;
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🔄 Reintentar de nuevo', callback_data: 'finance:retry' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Show known senders
   */
  private async showKnownSenders(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Obteniendo senders conocidos...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.getKnownSenders(this.getUserId(chatId));

    let text = `💰 *Finance Analyzer*\n\n📧 *Senders Conocidos*\n\n`;

    if (result.success) {
      const senders = result.result;
      if (Array.isArray(senders) && senders.length > 0) {
        for (const sender of senders.slice(0, 15)) {
          const status = sender.is_active ? '✅' : '❌';
          text += `${status} *${sender.sender_name}*\n`;
          text += `   \`${sender.keyword}\`\n`;
          text += `   Emails: ${sender.emails_matched} | Tipo: ${sender.sender_type}\n\n`;
        }
        if (senders.length > 15) {
          text += `_...y ${senders.length - 15} más_`;
        }
      } else {
        text += `No hay senders configurados.`;
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '🧠 Aprender Nuevos', callback_data: 'finance:learn' }],
      [{ text: '🔄 Actualizar', callback_data: 'finance:senders' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Learn new senders from emails
   */
  private async learnSendersAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const loadingText = '💰 *Finance Analyzer*\n\n⏳ Aprendiendo nuevos senders...';

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.learnSenders(this.getUserId(chatId), 100, 30);

    let text = `💰 *Finance Analyzer*\n\n🧠 *Aprender Senders*\n\n`;

    if (result.success) {
      const data = result.result;
      text +=
        `✅ *Aprendizaje completado*\n\n` +
        `• Emails analizados: ${data.emails_analyzed}\n` +
        `• Senders aprendidos: ${data.senders_learned}\n`;

      if (data.new_senders && data.new_senders.length > 0) {
        text += `\n*Nuevos senders:*\n`;
        for (const sender of data.new_senders.slice(0, 5)) {
          text += `• ${sender.sender_name || sender.keyword}\n`;
        }
      }
    } else {
      text += `❌ Error: ${result.result}`;
    }

    const keyboard = [
      [{ text: '📧 Ver Senders', callback_data: 'finance:senders' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Sync Firefly data
   */
  private async syncFireflyAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const loadingText = `${this.financeTitle(adv)}\n\n⏳ Sincronizando con Firefly...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.syncAll(this.getUserId(chatId));

    let text: string;

    if (result.success) {
      const data = result.result;
      if (adv) {
        text = `${this.financeTitle(adv)}\n\n🔄 *Sincronización Firefly*\n\n`;
        text += `✅ *Sincronización completada*\n\n`;
        if (data.accounts !== undefined) text += `• Cuentas: ${data.accounts}\n`;
        if (data.categories !== undefined) text += `• Categorías: ${data.categories}\n`;
        if (data.message) text += `\n${data.message}`;
      } else {
        text =
          `${this.financeTitle(adv)}\n\n` +
          `✅ *Datos actualizados en Firefly*\n\n` +
          (data.accounts !== undefined ? `• Cuentas sincronizadas: ${data.accounts}\n` : '') +
          (data.categories !== undefined ? `• Categorías: ${data.categories}\n` : '') +
          (data.message ? `\n${data.message}` : '');
      }
    } else {
      text = adv
        ? `${this.financeTitle(adv)}\n\n🔄 *Sincronización Firefly*\n\n❌ Error: ${result.result}`
        : `${this.financeTitle(adv)}\n\n❌ No se pudo sincronizar con Firefly.\n\n_Detalle: ${result.result}_`;
    }

    const keyboard = [
      [{ text: '🔄 Sincronizar de nuevo', callback_data: 'finance:sync' }],
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await this.editOrSend(chatId, messageId, text, keyboard);
  }

  /**
   * Ask user for Firefly token and send it to Finance API
   */
  private async setFireflyTokenAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    await this.wizardHandler.setFireflyTokenAction(chatId, messageId);
  }

  /**
   * Helper to edit message or send new one
   */
  private async editOrSend(
    chatId: number,
    messageId: number | undefined,
    text: string,
    keyboard: InlineKeyboardButton[][],
  ): Promise<void> {
    await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
  }

  // Legacy handlers for direct commands
  async batchProcessHandler(msg: TelegramBot.Message) {
    await this.batchHandler.batchProcessHandler(msg);
  }
}
