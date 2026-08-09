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
import { FinanceStatusHandler } from './finance.status.handler';
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
    private readonly statusHandler: FinanceStatusHandler,
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

  private async showApiUserId(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showApiUserId(chatId, messageId);
  }

  private async showGmailStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showGmailStatus(chatId, messageId);
  }

  private async showGmailReconnect(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showGmailReconnect(chatId, messageId);
  }

  private async showHealthCheck(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showHealthCheck(chatId, messageId);
  }

  private async showStatistics(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showStatistics(chatId, messageId);
  }

  private async showAuditLogs(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showAuditLogs(chatId, messageId);
  }

  private async showSchedulerStatus(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showSchedulerStatus(chatId, messageId);
  }

  private async retryFailedAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.retryFailedAction(chatId, messageId);
  }

  private async showKnownSenders(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.showKnownSenders(chatId, messageId);
  }

  private async learnSendersAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.learnSendersAction(chatId, messageId);
  }

  private async syncFireflyAction(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    return this.statusHandler.syncFireflyAction(chatId, messageId);
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
