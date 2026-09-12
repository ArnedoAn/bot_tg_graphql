import { Injectable } from '@nestjs/common';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import { UserMenuModeService } from '../../shared/instances/user-menu-mode.service';
import { FeatureFlagsService } from '../../shared/prisma/feature-flags.service';
import {
  financeTitle as financeTitleHelper,
  editOrSend as editOrSendHelper,
  buildSimpleMenuOptions as buildSimpleMenuOptionsHelper,
  buildAdvancedMenuOptions as buildAdvancedMenuOptionsHelper,
} from './finance.helpers';
import { FinanceWizardHandler } from './finance.wizard.handler';
import { FinanceBatchHandler } from './finance.batch.handler';
import { FinanceStatusHandler } from './finance.status.handler';
import { FEATURE_FLAGS } from '../../shared/constants/feature-flag-keys';

@Injectable()
export class FinanceHandler {
  private readonly bot: TelegramBot;

  constructor(
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly wizardHandler: FinanceWizardHandler,
    private readonly batchHandler: FinanceBatchHandler,
    private readonly statusHandler: FinanceStatusHandler,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private async isAdvanced(chatId: number): Promise<boolean> {
    return this.userMenuMode.isAdvancedUser(chatId);
  }

  async getMenuOptions(
    chatId: number,
    advanced?: boolean,
  ): Promise<InlineKeyboardButton[][]> {
    const adv = advanced ?? (await this.isAdvanced(chatId));
    return adv
      ? buildAdvancedMenuOptionsHelper(this.featureFlags)
      : buildSimpleMenuOptionsHelper(this.featureFlags);
  }

  /**
   * Show finance menu
   */
  async showMenu(chatId: number, messageId?: number): Promise<void> {
    if (!(await this.featureFlags.isEnabled(FEATURE_FLAGS.MODULE_FINANCE))) {
      const t = 'El módulo de finanzas no está disponible en este momento.';
      if (messageId) {
        await this.bot.editMessageText(t, {
          chat_id: chatId,
          message_id: messageId,
        });
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
    const text = `${financeTitleHelper(adv)}\n\n${intro}`;

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

  async showConfigReview(chatId: number, messageId?: number): Promise<void> {
    return this.wizardHandler.showConfigReview(chatId, messageId);
  }

  /**
   * Handle callback queries
   */
  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<boolean> {
    // Calendar navigation + date selection
    if (action.startsWith('cal_') || action.startsWith('date_')) {
      return this.batchHandler.handleCallback(chatId, action, messageId);
    }

    // Wizard domain: onboarding + review + ops menu
    if (
      action === 'wizard' ||
      action === 'review_setup' ||
      action === 'ops_menu' ||
      action.startsWith('wiz_')
    ) {
      return this.wizardHandler.handleCallback(chatId, action, messageId);
    }

    // Advanced-only gate (preserves original order: BEFORE batch/status routing)
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
        `${financeTitleHelper(adv)}\n\n` +
        'Esta opción solo está en *menú avanzado*. Pulsa *Cambiar modo de menú* en el inicio y elige *Menú avanzado*.';
      await editOrSendHelper(this.bot, chatId, messageId, text, [
        [{ text: '🔙 Volver', callback_data: 'menu:finance' }],
      ]);
      return true;
    }

    // Batch domain actions
    if (action === 'batch' || action === 'dryrun') {
      return this.batchHandler.handleCallback(chatId, action, messageId);
    }

    // APK delivery (lives in wizard handler)
    if (action === 'get_apk') {
      await this.wizardHandler.deliverFinanceApk(chatId, { messageId });
      return true;
    }

    // Firefly token (lives in wizard handler)
    if (action === 'firefly_token') {
      await this.wizardHandler.setFireflyTokenAction(chatId, messageId);
      return true;
    }

    // Menu navigation
    if (action === 'menu') {
      await this.showMenu(chatId, messageId);
      return true;
    }

    // Everything else → status domain (starts with stats, audit, gmail_*, health, show_user_id, scheduler, retry, senders, learn, sync, noop)
    return this.statusHandler.handleCallback(chatId, action, messageId);
  }

  // Legacy handlers for direct commands
  async batchProcessHandler(msg: TelegramBot.Message) {
    await this.batchHandler.batchProcessHandler(msg);
  }
}
