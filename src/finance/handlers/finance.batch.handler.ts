import { Injectable } from '@nestjs/common';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { BotService } from '../../shared/instances/bot.service';
import { UserMenuModeService } from '../../shared/instances/user-menu-mode.service';
import {
  FinanceService,
  BatchProcessingJobEnqueueResponse,
  ProcessingJobStatusResponse,
  BatchProcessingResponse,
} from '../finance.service';
import {
  financeTitle as financeTitleHelper,
  getUserId as getUserIdHelper,
  sleep as sleepHelper,
  editOrSend as editOrSendHelper,
} from './finance.helpers';

@Injectable()
export class FinanceBatchHandler {
  private readonly bot: TelegramBot;

  // Store user state for date selection
  private userDateState: Map<
    number,
    { year: number; month: number; dryRun: boolean }
  > = new Map();

  constructor(
    private readonly financeService: FinanceService,
    private readonly botInstance: BotService,
    private readonly userMenuMode: UserMenuModeService,
  ) {
    this.bot = this.botInstance.getBot();
  }

  private async isAdvanced(chatId: number): Promise<boolean> {
    return this.userMenuMode.isAdvancedUser(chatId);
  }

  /**
   * Initialize date selector calendar
   */
  async initDateSelector(
    chatId: number,
    messageId: number | undefined,
    dryRun: boolean,
  ): Promise<void> {
    const now = new Date();
    this.userDateState.set(chatId, {
      year: now.getFullYear(),
      month: now.getMonth(),
      dryRun,
    });

    await this.showDateSelector(chatId, messageId, dryRun);
  }

  /**
   * Generate calendar keyboard for date selection
   */
  private generateCalendarKeyboard(
    year: number,
    month: number,
    dryRun: boolean,
  ): InlineKeyboardButton[][] {
    const keyboard: InlineKeyboardButton[][] = [];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    // Header with month/year navigation
    keyboard.push([
      { text: '◀️', callback_data: `finance:cal_prev_${year}_${month}` },
      { text: `${months[month]} ${year}`, callback_data: 'finance:noop' },
      { text: '▶️', callback_data: `finance:cal_next_${year}_${month}` },
    ]);

    // Day headers
    keyboard.push([
      { text: 'Lu', callback_data: 'finance:noop' },
      { text: 'Ma', callback_data: 'finance:noop' },
      { text: 'Mi', callback_data: 'finance:noop' },
      { text: 'Ju', callback_data: 'finance:noop' },
      { text: 'Vi', callback_data: 'finance:noop' },
      { text: 'Sa', callback_data: 'finance:noop' },
      { text: 'Do', callback_data: 'finance:noop' },
    ]);

    // Days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = (firstDay.getDay() + 6) % 7; // Monday = 0

    let week: InlineKeyboardButton[] = [];
    // Empty cells before first day
    for (let i = 0; i < startingDay; i++) {
      week.push({ text: ' ', callback_data: 'finance:noop' });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      week.push({
        text: String(day),
        callback_data: `finance:date_${dateStr}_${dryRun ? 'dry' : 'live'}`,
      });

      if (week.length === 7) {
        keyboard.push(week);
        week = [];
      }
    }

    // Fill remaining days
    if (week.length > 0) {
      while (week.length < 7) {
        week.push({ text: ' ', callback_data: 'finance:noop' });
      }
      keyboard.push(week);
    }

    // Quick options
    keyboard.push([
      {
        text: '📅 Ayer',
        callback_data: `finance:date_yesterday_${dryRun ? 'dry' : 'live'}`,
      },
      {
        text: '📅 Última semana',
        callback_data: `finance:date_lastweek_${dryRun ? 'dry' : 'live'}`,
      },
    ]);

    keyboard.push([{ text: '🔙 Volver', callback_data: 'menu:finance' }]);

    return keyboard;
  }

  /**
   * Show date selector
   */
  private async showDateSelector(
    chatId: number,
    messageId: number | undefined,
    dryRun: boolean,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const state = this.userDateState.get(chatId);
    const year = state?.year || new Date().getFullYear();
    const month = state?.month || new Date().getMonth();

    const mode = dryRun ? '🔍 Modo Prueba' : '🚀 Modo Real';
    const dateHint = adv
      ? '📅 Desde qué fecha quieres procesar correos:'
      : '📅 Desde qué fecha quieres incluir movimientos de tus correos:';
    const text = adv
      ? `${financeTitleHelper(adv)}\n\n${mode}\n\n${dateHint}`
      : `${financeTitleHelper(adv)}\n\n${dateHint}`;

    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: this.generateCalendarKeyboard(year, month, dryRun),
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

  /**
   * Handle calendar navigation
   */
  async handleCalendarNavigation(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    if (action === 'noop') return;

    const state = this.userDateState.get(chatId);
    if (!state) return;

    if (action.startsWith('cal_prev_')) {
      const parts = action.split('_');
      state.year = parseInt(parts[2]);
      state.month = parseInt(parts[3]) - 1;
      if (state.month < 0) {
        state.month = 11;
        state.year--;
      }
    } else if (action.startsWith('cal_next_')) {
      const parts = action.split('_');
      state.year = parseInt(parts[2]);
      state.month = parseInt(parts[3]) + 1;
      if (state.month > 11) {
        state.month = 0;
        state.year++;
      }
    }

    this.userDateState.set(chatId, state);
    await this.showDateSelector(chatId, messageId, state.dryRun);
  }

  /**
   * Handle date selection and launch batch processing
   */
  async handleDateSelection(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<void> {
    const parts = action.replace('date_', '').split('_');
    let dryRun = parts[parts.length - 1] === 'dry';
    if (!(await this.isAdvanced(chatId))) {
      dryRun = false;
    }
    const dateParam = parts.slice(0, -1).join('_');

    let afterDate: string;
    if (dateParam === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      afterDate = this.financeService.formatDate(yesterday);
    } else if (dateParam === 'lastweek') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      afterDate = this.financeService.formatDate(lastWeek);
    } else {
      afterDate = dateParam;
    }

    await this.launchBatchAction(chatId, messageId, afterDate, dryRun);
  }

  /**
   * Launch batch processing action
   */
  private async launchBatchAction(
    chatId: number,
    messageId: number | undefined,
    afterDate: string,
    dryRun: boolean,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const mode = dryRun ? '🔍 Modo Prueba' : '🚀 Modo Real';
    const loadingText = adv
      ? `${financeTitleHelper(adv)}\n\n${mode}\n\n⏳ Encolando procesamiento desde ${afterDate}...`
      : `${financeTitleHelper(adv)}\n\n⏳ Preparando el proceso desde *${afterDate}*...`;

    if (messageId) {
      await this.bot.editMessageText(loadingText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
    } else {
      await this.bot.sendMessage(chatId, loadingText, {
        parse_mode: 'Markdown',
      });
    }

    const result = await this.financeService.launchBatchProcessing(
      getUserIdHelper(chatId),
      afterDate,
      200,
      dryRun,
    );

    if (!result.success) {
      const text = adv
        ? `${financeTitleHelper(adv)}\n\n❌ Error al encolar job: ${result.result}`
        : `${financeTitleHelper(adv)}\n\n❌ No se pudo iniciar el proceso. Intenta de nuevo o más tarde.\n\n_Detalle: ${result.result}_`;
      const keyboard = [
        [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
      ];
      await editOrSendHelper(this.bot, chatId, messageId, text, keyboard);
      return;
    }

    const enqueueData = result.result as BatchProcessingJobEnqueueResponse;
    const jobId = enqueueData.job_id;
    const pollEverySeconds = 3;
    const queuedText = adv
      ? `${financeTitleHelper(adv)}\n\n` +
        `${mode}\n\n` +
        `🕒 *Job encolado*\n` +
        `• Job ID: \`${jobId}\`\n` +
        `• Estado inicial: ${enqueueData.status}\n\n` +
        `Voy a monitorearlo y te aviso cuando termine.\n` +
        `⏱️ Polling cada ${pollEverySeconds}s`
      : `${financeTitleHelper(adv)}\n\n` +
        `✅ Tu proceso ya está en cola. Te avisaré aquí cuando termine.\n\n` +
        `_Si tarda mucho, no cierres Telegram._`;

    const keyboard = [
      [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
    ];
    await editOrSendHelper(this.bot, chatId, messageId, queuedText, keyboard);

    void this.pollBatchJobAndNotify(chatId, jobId, mode);
  }

  private async pollBatchJobAndNotify(
    chatId: number,
    jobId: string,
    modeLabel: string,
  ): Promise<void> {
    const adv = await this.isAdvanced(chatId);
    const maxAttempts = 120;
    const intervalMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await sleepHelper(intervalMs);

      const jobResult = await this.financeService.getProcessingJobStatus(
        getUserIdHelper(chatId),
        jobId,
      );

      if (!jobResult.success) {
        if (attempt % 10 !== 0) continue;
        const pollErr = adv
          ? `${financeTitleHelper(adv)}\n\n⚠️ No pude consultar el estado del job \`${jobId}\`.\nIntento ${attempt}/${maxAttempts}.`
          : `${financeTitleHelper(adv)}\n\n⚠️ No pude comprobar el avance del proceso. Sigo intentando… (${attempt}/${maxAttempts})`;
        await this.bot.sendMessage(chatId, pollErr, {
          parse_mode: 'Markdown',
        });
        continue;
      }

      const job = jobResult.result as ProcessingJobStatusResponse;
      if (job.status === 'queued' || job.status === 'running') continue;

      if (job.status === 'failed') {
        const failText = adv
          ? `${financeTitleHelper(adv)}\n\n${modeLabel}\n\n❌ *Job falló*\n• Job ID: \`${jobId}\`\n• Error: ${job.error_message || 'Sin detalle'}`
          : `${financeTitleHelper(adv)}\n\n❌ *No se pudo completar el proceso*\n\n${job.error_message || 'Error desconocido. Intenta de nuevo o revisa Gmail y Firefly.'}`;
        await this.bot.sendMessage(chatId, failText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
            ],
          },
        });
        return;
      }

      if (job.status === 'completed') {
        const data = (job.result || {}) as BatchProcessingResponse;
        const text = adv
          ? `${financeTitleHelper(adv)}\n\n` +
            `${modeLabel}\n\n` +
            `✅ *Trabajo terminado*\n\n` +
            `• Job ID: \`${jobId}\`\n` +
            `• Total emails: ${data.total_emails ?? 0}\n` +
            `• Procesados: ${data.processed ?? 0}\n` +
            `• Creados: ${data.created ?? 0}\n` +
            `• Omitidos: ${data.skipped ?? 0}\n` +
            `• Fallidos: ${data.failed ?? 0}\n` +
            `• Tiempo: ${data.processing_time_ms ?? 0}ms`
          : `${financeTitleHelper(adv)}\n\n` +
            `✅ *Listo*\n\n` +
            `• Correos revisados: ${data.total_emails ?? 0}\n` +
            `• Movimientos registrados (nuevos): ${data.created ?? 0}\n` +
            `• Sin cambios / ya estaban: ${data.skipped ?? 0}\n` +
            `• Con error: ${data.failed ?? 0}\n\n` +
            `_Tiempo aproximado: ${data.processing_time_ms ?? 0} ms_`;

        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
            ],
          },
        });
        return;
      }
    }

    const timeoutText = adv
      ? `${financeTitleHelper(adv)}\n\n⏰ El job \`${jobId}\` sigue en progreso o no respondió a tiempo.\nPuedes intentar nuevamente desde el menú.`
      : `${financeTitleHelper(adv)}\n\n⏰ El proceso sigue tardando o no hubo respuesta a tiempo. Prueba otra vez desde *Finanzas* más tarde.`;
    await this.bot.sendMessage(chatId, timeoutText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Volver al Menú', callback_data: 'menu:finance' }],
        ],
      },
    });
  }

  // Legacy handlers for direct commands
  async batchProcessHandler(msg: TelegramBot.Message) {
    await this.initDateSelector(msg.chat.id, undefined, false);
  }

  async handleCallback(
    chatId: number,
    action: string,
    messageId?: number,
  ): Promise<boolean> {
    if (action.startsWith('cal_')) {
      await this.handleCalendarNavigation(chatId, action, messageId);
      return true;
    }
    if (action.startsWith('date_')) {
      await this.handleDateSelection(chatId, action, messageId);
      return true;
    }
    if (action === 'batch' || action === 'batch_process') {
      await this.initDateSelector(chatId, messageId, false);
      return true;
    }
    if (action === 'dryrun') {
      await this.initDateSelector(chatId, messageId, true);
      return true;
    }
    return false;
  }
}
